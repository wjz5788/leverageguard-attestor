from fastapi import FastAPI, HTTPException, BackgroundTasks, Query, Depends
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional, Any
import uvicorn
import time
import asyncio
import os
import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
import tempfile
import shutil
import io
import uuid

# 导入共享组件
from ..common.logger import logger, audit_logger
from ..common.config_manager import config_manager
from ..common.message_queue import mq_client, QUEUE_REPORT_REQUESTS, QUEUE_REPORT_NOTIFICATIONS

# 初始化FastAPI应用
app = FastAPI(
    title="Report Generation Service",
    description="Service for generating LeverageGuard reports and analytics",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# 报告配置
REPORT_TYPES = ["daily", "weekly", "monthly", "quarterly", "yearly", "custom"]
DEFAULT_REPORT_FORMAT = "json"
ALLOWED_REPORT_FORMATS = ["json", "csv", "pdf", "excel"]
REPORT_STORAGE_PATH = config_manager.get('reports.storage_path', '/tmp/leverageguard_reports')

# 确保报告存储目录存在
if not os.path.exists(REPORT_STORAGE_PATH):
    try:
        os.makedirs(REPORT_STORAGE_PATH)
        logger.info(f"Created report storage directory: {REPORT_STORAGE_PATH}")
    except Exception as e:
        logger.error(f"Failed to create report storage directory: {str(e)}")

# 报告请求模型
class ReportRequest(BaseModel):
    report_id: str = Field(default_factory=lambda: f"report-{uuid.uuid4()}", description="Unique report identifier")
    report_type: str = Field(..., description="Type of report to generate")
    format: str = Field(default=DEFAULT_REPORT_FORMAT, description="Output format of the report")
    start_date: Optional[int] = Field(None, description="Start date timestamp for custom reports")
    end_date: Optional[int] = Field(None, description="End date timestamp for custom reports")
    include_verifications: bool = Field(default=True, description="Include order verification data")
    include_payouts: bool = Field(default=True, description="Include payout data")
    include_fund_movements: bool = Field(default=True, description="Include fund movement data")
    include_risk_analytics: bool = Field(default=True, description="Include risk analytics data")
    user_address: Optional[str] = Field(None, description="Filter by user address")
    generate_pdf: bool = Field(default=False, description="Generate PDF with visualizations")
    notify_by_email: bool = Field(default=False, description="Send notification email when report is ready")

    @validator('report_type')
    def validate_report_type(cls, v):
        """验证报告类型"""
        if v not in REPORT_TYPES:
            raise ValueError(f"Report type must be one of: {', '.join(REPORT_TYPES)}")
        return v

    @validator('format')
    def validate_format(cls, v):
        """验证报告格式"""
        if v not in ALLOWED_REPORT_FORMATS:
            raise ValueError(f"Report format must be one of: {', '.join(ALLOWED_REPORT_FORMATS)}")
        return v

    @validator('end_date')
    def validate_date_range(cls, v, values):
        """验证日期范围"""
        if 'start_date' in values and values['start_date'] and v and v < values['start_date']:
            raise ValueError("End date must be after start date")
        return v

# 报告状态模型
class ReportStatus(BaseModel):
    report_id: str
    status: str  # pending, generating, completed, failed
    progress: int  # 0-100
    estimated_completion: Optional[int] = None
    download_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: int
    updated_at: int

# 报告元数据模型
class ReportMetadata(BaseModel):
    report_id: str
    report_type: str
    format: str
    start_date: Optional[int] = None
    end_date: Optional[int] = None
    created_at: int
    completed_at: Optional[int] = None
    size_bytes: Optional[int] = None
    generated_by: str = "report_generation_service"

# 内部函数：获取日期范围
def get_date_range(report_type: str, start_date: Optional[int] = None, end_date: Optional[int] = None) -> Tuple[int, int]:
    """根据报告类型获取日期范围"""
    now = datetime.now()
    
    if report_type == "daily":
        # 昨天的日期范围
        start = now - timedelta(days=1)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif report_type == "weekly":
        # 上周的日期范围
        start = now - timedelta(days=now.weekday() + 7)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=6)
        end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif report_type == "monthly":
        # 上个月的日期范围
        start = now.replace(day=1) - timedelta(days=1)
        start = start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = start.replace(day=28) + timedelta(days=4)
        end = end - timedelta(days=end.day)
        end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif report_type == "quarterly":
        # 上个季度的日期范围
        current_month = now.month
        quarter = (current_month - 1) // 3
        start_month = quarter * 3
        start = now.replace(month=start_month, day=1, hour=0, minute=0, second=0, microsecond=0)
        start = start - timedelta(days=1)
        start = start.replace(day=1)
        end_month = start_month + 2
        end = start.replace(month=end_month, day=28) + timedelta(days=4)
        end = end - timedelta(days=end.day)
        end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif report_type == "yearly":
        # 上一年的日期范围
        start = now.replace(year=now.year - 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now.replace(year=now.year - 1, month=12, day=31, hour=23, minute=59, second=59, microsecond=999999)
    elif report_type == "custom" and start_date and end_date:
        # 自定义日期范围
        start = datetime.fromtimestamp(start_date)
        end = datetime.fromtimestamp(end_date)
    else:
        # 默认使用最近7天的日期范围
        start = now - timedelta(days=7)
        end = now
    
    # 转换为时间戳
    return int(start.timestamp()), int(end.timestamp())

# 内部函数：生成示例数据
def generate_sample_data(start_date: int, end_date: int, include_verifications: bool = True, 
                        include_payouts: bool = True, include_fund_movements: bool = True) -> Dict[str, Any]:
    """生成示例报告数据"""
    # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询真实数据
    
    data = {
        "metadata": {
            "report_id": f"report-{int(time.time())}",
            "generated_at": int(time.time()),
            "time_range": {
                "start": start_date,
                "end": end_date,
                "start_readable": datetime.fromtimestamp(start_date).strftime('%Y-%m-%d %H:%M:%S'),
                "end_readable": datetime.fromtimestamp(end_date).strftime('%Y-%m-%d %H:%M:%S')
            }
        },
        "summary": {
            "total_orders": 0,
            "total_payouts": 0,
            "total_fund_movements": 0,
            "total_users": 0,
            "total_volume": 0.0
        }
    }
    
    # 生成订单验证数据
    if include_verifications:
        data["verifications"] = {
            "total": 157,
            "valid": 148,
            "invalid": 9,
            "risk_scores": {
                "low": 85,
                "medium": 42,
                "high": 20
            },
            "daily_stats": [
                {"date": "2023-05-01", "count": 22, "valid": 20, "invalid": 2},
                {"date": "2023-05-02", "count": 25, "valid": 24, "invalid": 1},
                {"date": "2023-05-03", "count": 18, "valid": 17, "invalid": 1},
                {"date": "2023-05-04", "count": 20, "valid": 19, "invalid": 1},
                {"date": "2023-05-05", "count": 21, "valid": 21, "invalid": 0},
                {"date": "2023-05-06", "count": 24, "valid": 21, "invalid": 3},
                {"date": "2023-05-07", "count": 27, "valid": 26, "invalid": 1}
            ]
        }
        data["summary"]["total_orders"] = data["verifications"]["total"]
    
    # 生成赔付数据
    if include_payouts:
        data["payouts"] = {
            "total": 32,
            "completed": 28,
            "failed": 4,
            "total_amount": 12560.75,
            "average_amount": 392.52,
            "daily_stats": [
                {"date": "2023-05-01", "count": 5, "amount": 1850.25},
                {"date": "2023-05-02", "count": 4, "amount": 1200.50},
                {"date": "2023-05-03", "count": 6, "amount": 2450.75},
                {"date": "2023-05-04", "count": 3, "amount": 980.25},
                {"date": "2023-05-05", "count": 7, "amount": 3120.00},
                {"date": "2023-05-06", "count": 4, "amount": 1680.50},
                {"date": "2023-05-07", "count": 3, "amount": 1278.50}
            ]
        }
        data["summary"]["total_payouts"] = data["payouts"]["total"]
        data["summary"]["total_volume"] = data["payouts"]["total_amount"]
    
    # 生成资金流动数据
    if include_fund_movements:
        data["fund_movements"] = {
            "total": 48,
            "deposits": 23,
            "withdrawals": 12,
            "transfers": 13,
            "total_deposit_amount": 50000.00,
            "total_withdrawal_amount": 25000.00,
            "total_transfer_amount": 15000.00,
            "daily_stats": [
                {"date": "2023-05-01", "deposits": 4, "withdrawals": 2, "transfers": 2},
                {"date": "2023-05-02", "deposits": 3, "withdrawals": 1, "transfers": 1},
                {"date": "2023-05-03", "deposits": 5, "withdrawals": 3, "transfers": 2},
                {"date": "2023-05-04", "deposits": 2, "withdrawals": 2, "transfers": 3},
                {"date": "2023-05-05", "deposits": 3, "withdrawals": 1, "transfers": 2},
                {"date": "2023-05-06", "deposits": 3, "withdrawals": 2, "transfers": 1},
                {"date": "2023-05-07", "deposits": 3, "withdrawals": 1, "transfers": 2}
            ]
        }
        data["summary"]["total_fund_movements"] = data["fund_movements"]["total"]
    
    # 生成风险分析数据
    data["risk_analytics"] = {
        "current_exposure_ratio": 0.65,
        "current_reserve_ratio": 0.35,
        "risk_level": "medium",
        "peak_exposure_ratio": 0.72,
        "lowest_reserve_ratio": 0.28,
        "risk_trends": [
            {"date": "2023-05-01", "exposure_ratio": 0.62, "reserve_ratio": 0.38},
            {"date": "2023-05-02", "exposure_ratio": 0.65, "reserve_ratio": 0.35},
            {"date": "2023-05-03", "exposure_ratio": 0.68, "reserve_ratio": 0.32},
            {"date": "2023-05-04", "exposure_ratio": 0.72, "reserve_ratio": 0.28},
            {"date": "2023-05-05", "exposure_ratio": 0.70, "reserve_ratio": 0.30},
            {"date": "2023-05-06", "exposure_ratio": 0.67, "reserve_ratio": 0.33},
            {"date": "2023-05-07", "exposure_ratio": 0.65, "reserve_ratio": 0.35}
        ]
    }
    
    # 生成用户统计数据
    data["user_stats"] = {
        "total_active_users": 45,
        "new_users": 12,
        "top_users_by_volume": [
            {"user_address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", "volume": 3250.50},
            {"user_address": "0x617F2E2fD72FD9D5503197092aC168c91465E7f2", "volume": 2890.75},
            {"user_address": "0x1234567890123456789012345678901234567890", "volume": 2100.25}
        ]
    }
    data["summary"]["total_users"] = data["user_stats"]["total_active_users"]
    
    return data

# 内部函数：生成可视化图表
def generate_visualizations(report_data: Dict[str, Any], output_dir: str) -> List[str]:
    """生成报告可视化图表"""
    chart_files = []
    
    try:
        # 设置中文字体支持
        plt.rcParams["font.family"] = ["SimHei", "WenQuanYi Micro Hei", "Heiti TC"]
        plt.rcParams["axes.unicode_minus"] = False  # 正确显示负号
        
        # 1. 订单验证统计图表
        if "verifications" in report_data:
            fig, ax = plt.subplots(figsize=(10, 6))
            daily_stats = report_data["verifications"]["daily_stats"]
            dates = [d["date"] for d in daily_stats]
            valid = [d["valid"] for d in daily_stats]
            invalid = [d["invalid"] for d in daily_stats]
            
            ax.bar(dates, valid, label="有效订单", color="#4CAF50")
            ax.bar(dates, invalid, bottom=valid, label="无效订单", color="#F44336")
            ax.set_xlabel("日期")
            ax.set_ylabel("订单数量")
            ax.set_title("每日订单验证统计")
            ax.legend()
            plt.xticks(rotation=45)
            plt.tight_layout()
            
            chart_path = os.path.join(output_dir, "verification_stats.png")
            plt.savefig(chart_path)
            chart_files.append(chart_path)
            plt.close()
        
        # 2. 赔付金额统计图表
        if "payouts" in report_data:
            fig, ax = plt.subplots(figsize=(10, 6))
            daily_stats = report_data["payouts"]["daily_stats"]
            dates = [d["date"] for d in daily_stats]
            amounts = [d["amount"] for d in daily_stats]
            
            ax.plot(dates, amounts, marker='o', linestyle='-', color="#2196F3")
            ax.set_xlabel("日期")
            ax.set_ylabel("赔付金额")
            ax.set_title("每日赔付金额趋势")
            plt.xticks(rotation=45)
            plt.tight_layout()
            
            chart_path = os.path.join(output_dir, "payout_trend.png")
            plt.savefig(chart_path)
            chart_files.append(chart_path)
            plt.close()
        
        # 3. 风险比率趋势图表
        if "risk_analytics" in report_data:
            fig, ax1 = plt.subplots(figsize=(10, 6))
            risk_trends = report_data["risk_analytics"]["risk_trends"]
            dates = [d["date"] for d in risk_trends]
            exposure_ratio = [d["exposure_ratio"] * 100 for d in risk_trends]
            reserve_ratio = [d["reserve_ratio"] * 100 for d in risk_trends]
            
            ax1.plot(dates, exposure_ratio, marker='o', linestyle='-', color="#FF9800", label="风险敞口比率")
            ax1.set_xlabel("日期")
            ax1.set_ylabel("风险敞口比率 (%)", color="#FF9800")
            ax1.tick_params(axis='y', labelcolor="#FF9800")
            
            ax2 = ax1.twinx()
            ax2.plot(dates, reserve_ratio, marker='s', linestyle='--', color="#9C27B0", label="准备金比率")
            ax2.set_ylabel("准备金比率 (%)", color="#9C27B0")
            ax2.tick_params(axis='y', labelcolor="#9C27B0")
            
            fig.suptitle("风险比率趋势")
            fig.tight_layout(rect=[0, 0, 1, 0.95])  # 为suptitle留出空间
            fig.legend(loc="upper right")
            plt.xticks(rotation=45)
            
            chart_path = os.path.join(output_dir, "risk_trend.png")
            plt.savefig(chart_path)
            chart_files.append(chart_path)
            plt.close()
        
        # 4. 资金流动饼图
        if "fund_movements" in report_data:
            fig, ax = plt.subplots(figsize=(8, 8))
            labels = ['存款', '取款', '内部转账']
            sizes = [
                report_data["fund_movements"]["deposits"],
                report_data["fund_movements"]["withdrawals"],
                report_data["fund_movements"]["transfers"]
            ]
            colors = ['#4CAF50', '#F44336', '#2196F3']
            
            ax.pie(sizes, labels=labels, colors=colors, autopct='%1.1f%%',
                   shadow=True, startangle=90)
            ax.axis('equal')  # 确保饼图是圆形的
            ax.set_title("资金流动分布")
            
            chart_path = os.path.join(output_dir, "fund_movement_dist.png")
            plt.savefig(chart_path)
            chart_files.append(chart_path)
            plt.close()
        
        logger.info(f"Generated {len(chart_files)} visualization charts")
    except Exception as e:
        logger.error(f"Error generating visualizations: {str(e)}")
    
    return chart_files

# 内部函数：生成JSON报告
def generate_json_report(report_data: Dict[str, Any], output_path: str) -> bool:
    """生成JSON格式的报告"""
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, ensure_ascii=False, indent=2)
        logger.info(f"JSON report generated: {output_path}")
        return True
    except Exception as e:
        logger.error(f"Error generating JSON report: {str(e)}")
        return False

# 内部函数：生成CSV报告
def generate_csv_report(report_data: Dict[str, Any], output_path: str) -> bool:
    """生成CSV格式的报告"""
    try:
        # 创建一个临时目录来存储CSV文件
        temp_dir = tempfile.mkdtemp()
        
        # 如果需要生成多个CSV文件，我们可以创建一个ZIP文件
        # 但这里我们只创建一个主报告CSV
        main_data = {
            "报告ID": report_data["metadata"]["report_id"],
            "生成时间": datetime.fromtimestamp(report_data["metadata"]["generated_at"]).strftime('%Y-%m-%d %H:%M:%S'),
            "时间范围开始": report_data["metadata"]["time_range"]["start_readable"],
            "时间范围结束": report_data["metadata"]["time_range"]["end_readable"],
            "总订单数": report_data["summary"]["total_orders"],
            "总赔付数": report_data["summary"]["total_payouts"],
            "总资金流动": report_data["summary"]["total_fund_movements"],
            "总用户数": report_data["summary"]["total_users"],
            "总交易量": report_data["summary"]["total_volume"]
        }
        
        # 创建DataFrame
        df = pd.DataFrame([main_data])
        
        # 保存为CSV文件
        df.to_csv(output_path, index=False, encoding='utf-8-sig')
        
        # 清理临时目录
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        logger.info(f"CSV report generated: {output_path}")
        return True
    except Exception as e:
        logger.error(f"Error generating CSV report: {str(e)}")
        return False

# 内部函数：生成Excel报告
def generate_excel_report(report_data: Dict[str, Any], output_path: str) -> bool:
    """生成Excel格式的报告"""
    try:
        # 创建Excel写入器
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            # 1. 摘要信息表
            summary_data = {
                "指标名称": [
                    "总订单数", "总赔付数", "总资金流动", "总用户数", "总交易量"
                ],
                "数值": [
                    report_data["summary"]["total_orders"],
                    report_data["summary"]["total_payouts"],
                    report_data["summary"]["total_fund_movements"],
                    report_data["summary"]["total_users"],
                    report_data["summary"]["total_volume"]
                ]
            }
            df_summary = pd.DataFrame(summary_data)
            df_summary.to_excel(writer, sheet_name='摘要', index=False)
            
            # 2. 订单验证数据（如果有）
            if "verifications" in report_data:
                df_verification = pd.DataFrame(report_data["verifications"]["daily_stats"])
                df_verification.to_excel(writer, sheet_name='订单验证', index=False)
            
            # 3. 赔付数据（如果有）
            if "payouts" in report_data:
                df_payout = pd.DataFrame(report_data["payouts"]["daily_stats"])
                df_payout.to_excel(writer, sheet_name='赔付记录', index=False)
            
            # 4. 风险分析数据
            if "risk_analytics" in report_data:
                df_risk = pd.DataFrame(report_data["risk_analytics"]["risk_trends"])
                df_risk.to_excel(writer, sheet_name='风险分析', index=False)
        
        logger.info(f"Excel report generated: {output_path}")
        return True
    except Exception as e:
        logger.error(f"Error generating Excel report: {str(e)}")
        return False

# 内部函数：生成完整报告
def generate_report(request: ReportRequest, temp_dir: str) -> Tuple[bool, str, Dict[str, Any]]:
    """根据请求生成完整报告"""
    try:
        logger.info(f"Generating report: {request.report_id}, Type: {request.report_type}")
        
        # 获取日期范围
        start_date, end_date = get_date_range(request.report_type, request.start_date, request.end_date)
        
        # 生成报告数据
        report_data = generate_sample_data(
            start_date, 
            end_date, 
            request.include_verifications, 
            request.include_payouts, 
            request.include_fund_movements
        )
        
        # 更新报告ID
        report_data["metadata"]["report_id"] = request.report_id
        
        # 生成可视化图表
        if request.generate_pdf:
            chart_files = generate_visualizations(report_data, temp_dir)
            report_data["metadata"]["chart_files"] = chart_files
        
        # 根据格式生成报告文件
        report_file = None
        if request.format == "json":
            report_file = os.path.join(temp_dir, f"{request.report_id}.json")
            success = generate_json_report(report_data, report_file)
        elif request.format == "csv":
            report_file = os.path.join(temp_dir, f"{request.report_id}.csv")
            success = generate_csv_report(report_data, report_file)
        elif request.format == "excel":
            report_file = os.path.join(temp_dir, f"{request.report_id}.xlsx")
            success = generate_excel_report(report_data, report_file)
        elif request.format == "pdf":
            # 注意：PDF生成需要额外的库支持（如reportlab）
            # 这里提供一个简化的实现
            report_file = os.path.join(temp_dir, f"{request.report_id}.pdf")
            # 创建一个简单的文本文件作为PDF的替代品
            with open(report_file, 'w', encoding='utf-8') as f:
                f.write("PDF generation requires additional libraries (reportlab).\n")
                f.write(f"Report ID: {request.report_id}\n")
                f.write(f"Report Type: {request.report_type}\n")
            success = True
        else:
            logger.error(f"Unsupported report format: {request.format}")
            return False, "Unsupported report format", {}
        
        if success and report_file:
            logger.info(f"Report generation completed: {request.report_id}")
            return True, report_file, report_data
        else:
            logger.error(f"Report generation failed: {request.report_id}")
            return False, "Report generation failed", {}
    except Exception as e:
        logger.error(f"Error generating report: {str(e)}")
        return False, str(e), {}

# 异步函数：处理队列中的报告请求
async def process_report_queue():
    """从队列中获取报告请求并处理"""
    def callback(ch, method, properties, body):
        """队列消息处理回调函数"""
        try:
            # 解析报告请求数据
            import json
            request_data = json.loads(body)
            request = ReportRequest(**request_data)
            
            # 创建临时目录
            temp_dir = tempfile.mkdtemp()
            
            try:
                # 更新报告状态为生成中
                update_report_status(request.report_id, "generating", 10)
                
                # 生成报告
                success, result_path, report_data = generate_report(request, temp_dir)
                
                if success and result_path:
                    # 保存报告文件
                    final_path = save_report_file(result_path, request.report_id, request.format)
                    
                    # 更新报告状态为完成
                    update_report_status(
                        request.report_id,
                        "completed",
                        100,
                        download_url=f"/api/report/download/{request.report_id}"
                    )
                    
                    # 记录审计日志
                    audit_logger.log_report_generation(
                        report_id=request.report_id,
                        report_type=request.report_type,
                        format=request.format,
                        status="completed",
                        file_path=final_path
                    )
                    
                    # 发送完成通知
                    if request.notify_by_email:
                        notification = {
                            "report_id": request.report_id,
                            "status": "completed",
                            "download_url": f"/api/report/download/{request.report_id}",
                            "notify_email": request_data.get("notify_email", None),
                            "timestamp": int(time.time())
                        }
                        mq_client.publish_message(QUEUE_REPORT_NOTIFICATIONS, notification)
                    
                else:
                    # 更新报告状态为失败
                    update_report_status(
                        request.report_id,
                        "failed",
                        0,
                        error_message=result_path
                    )
                    
                    # 记录审计日志
                    audit_logger.log_report_generation(
                        report_id=request.report_id,
                        report_type=request.report_type,
                        format=request.format,
                        status="failed",
                        error_message=result_path
                    )
                    
            finally:
                # 清理临时目录
                shutil.rmtree(temp_dir, ignore_errors=True)
            
            # 确认消息已处理
            ch.basic_ack(delivery_tag=method.delivery_tag)
            
        except Exception as e:
            logger.error(f"Error processing report request: {str(e)}")
            # 处理失败，将消息重新入队或死信队列
            try:
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            except:
                pass
    
    # 消费队列消息
    mq_client.consume_messages(QUEUE_REPORT_REQUESTS, callback)

# 内部函数：保存报告文件
def save_report_file(temp_path: str, report_id: str, format: str) -> str:
    """保存报告文件到存储目录"""
    try:
        # 确保报告存储目录存在
        if not os.path.exists(REPORT_STORAGE_PATH):
            os.makedirs(REPORT_STORAGE_PATH)
        
        # 生成最终文件路径
        file_extension = format.lower()
        if file_extension == "pdf":
            final_path = os.path.join(REPORT_STORAGE_PATH, f"{report_id}.pdf")
        elif file_extension == "csv":
            final_path = os.path.join(REPORT_STORAGE_PATH, f"{report_id}.csv")
        elif file_extension == "excel":
            final_path = os.path.join(REPORT_STORAGE_PATH, f"{report_id}.xlsx")
        else:
            final_path = os.path.join(REPORT_STORAGE_PATH, f"{report_id}.json")
        
        # 复制文件到最终位置
        shutil.copy2(temp_path, final_path)
        
        logger.info(f"Report file saved: {final_path}")
        return final_path
    except Exception as e:
        logger.error(f"Error saving report file: {str(e)}")
        raise

# 内部函数：更新报告状态（简化实现）
def update_report_status(report_id: str, status: str, progress: int, download_url: Optional[str] = None, 
                        error_message: Optional[str] = None):
    """更新报告状态"""
    # 注意：这是一个简化的实现。在实际应用中，应该更新数据库中的报告状态
    logger.info(f"Report status updated: {report_id} - {status}, Progress: {progress}%")

# API端点：健康检查
@app.get("/health", tags=["Health"])
async def health_check():
    """检查报告生成服务健康状态"""
    # 检查消息队列连接
    mq_connected = mq_client.connected or mq_client.connect()
    
    # 检查报告存储目录
    storage_accessible = os.path.exists(REPORT_STORAGE_PATH) and os.access(REPORT_STORAGE_PATH, os.W_OK)
    
    # 总体健康状态
    overall_status = "up" if mq_connected and storage_accessible else "down"
    
    return {
        "status": overall_status,
        "timestamp": int(time.time()),
        "message_queue_connected": mq_connected,
        "storage_accessible": storage_accessible,
        "report_storage_path": REPORT_STORAGE_PATH
    }

# API端点：生成报告（同步）
@app.post("/api/report/generate", tags=["Report Generation"], response_model=Dict[str, Any])
async def generate_report_endpoint(request: ReportRequest):
    """同步生成报告并返回结果"""
    try:
        logger.info(f"Received synchronous report request: {request.report_id}")
        
        # 创建临时目录
        temp_dir = tempfile.mkdtemp()
        
        try:
            # 生成报告
            success, result_path, report_data = generate_report(request, temp_dir)
            
            if success and result_path:
                # 保存报告文件
                final_path = save_report_file(result_path, request.report_id, request.format)
                
                # 记录审计日志
                audit_logger.log_report_generation(
                    report_id=request.report_id,
                    report_type=request.report_type,
                    format=request.format,
                    status="completed",
                    file_path=final_path
                )
                
                return {
                    "status": "success",
                    "message": "Report generated successfully",
                    "report_id": request.report_id,
                    "download_url": f"/api/report/download/{request.report_id}",
                    "file_size": os.path.getsize(final_path),
                    "format": request.format,
                    "timestamp": int(time.time())
                }
            else:
                # 记录审计日志
                audit_logger.log_report_generation(
                    report_id=request.report_id,
                    report_type=request.report_type,
                    format=request.format,
                    status="failed",
                    error_message=result_path
                )
                
                raise HTTPException(status_code=500, detail=f"Failed to generate report: {result_path}")
        finally:
            # 清理临时目录
            shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception as e:
        logger.error(f"Error in generate_report_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# API端点：生成报告（异步）
@app.post("/api/report/generate/async", tags=["Report Generation"])
async def generate_report_async(request: ReportRequest, background_tasks: BackgroundTasks):
    """异步生成报告"""
    try:
        logger.info(f"Received asynchronous report request: {request.report_id}")
        
        # 将请求发布到消息队列
        request_dict = request.dict()
        success = mq_client.publish_message(QUEUE_REPORT_REQUESTS, request_dict)
        
        if success:
            # 初始化报告状态
            update_report_status(request.report_id, "pending", 0)
            
            # 记录审计日志
            audit_logger.log_report_request(
                report_id=request.report_id,
                report_type=request.report_type,
                format=request.format,
                async_request=True
            )
            
            return {
                "status": "success",
                "message": "Report generation request submitted",
                "report_id": request.report_id,
                "status_url": f"/api/report/status/{request.report_id}",
                "timestamp": int(time.time())
            }
        else:
            logger.error(f"Failed to submit report request to queue: {request.report_id}")
            raise HTTPException(status_code=500, detail="Failed to submit report request")
    except Exception as e:
        logger.error(f"Error in generate_report_async: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# API端点：获取报告状态
@app.get("/api/report/status/{report_id}", tags=["Report Management"])
async def get_report_status(report_id: str):
    """获取报告生成状态"""
    # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询报告状态
    # 这里返回示例数据
    return {
        "report_id": report_id,
        "status": "completed",
        "progress": 100,
        "estimated_completion": None,
        "download_url": f"/api/report/download/{report_id}",
        "error_message": None,
        "created_at": int(time.time() - 300),  # 5分钟前创建
        "updated_at": int(time.time() - 60)  # 1分钟前更新
    }

# API端点：下载报告
@app.get("/api/report/download/{report_id}", tags=["Report Management"])
async def download_report(report_id: str):
    """下载生成的报告文件"""
    try:
        # 在实际应用中，应该从数据库中查询报告的实际格式和路径
        # 这里我们尝试查找常见格式的报告文件
        formats_to_try = ["json", "csv", "xlsx", "pdf"]
        report_file = None
        
        for format in formats_to_try:
            file_path = os.path.join(REPORT_STORAGE_PATH, f"{report_id}.{format}")
            if os.path.exists(file_path):
                report_file = file_path
                break
        
        # 如果找不到文件，尝试使用示例报告
        if not report_file:
            # 创建一个简单的示例报告
            temp_dir = tempfile.mkdtemp()
            try:
                # 创建示例报告数据
                request = ReportRequest(
                    report_id=report_id,
                    report_type="daily",
                    format="json"
                )
                
                # 生成报告
                _, report_file, _ = generate_report(request, temp_dir)
                
                # 保存报告文件
                if report_file:
                    final_path = save_report_file(report_file, report_id, "json")
                    report_file = final_path
            finally:
                # 清理临时目录
                shutil.rmtree(temp_dir, ignore_errors=True)
        
        if not report_file or not os.path.exists(report_file):
            raise HTTPException(status_code=404, detail=f"Report not found: {report_id}")
        
        # 获取文件名和媒体类型
        filename = os.path.basename(report_file)
        extension = os.path.splitext(filename)[1].lower()
        
        media_type = "application/octet-stream"
        if extension == ".json":
            media_type = "application/json"
        elif extension == ".csv":
            media_type = "text/csv"
        elif extension in [".xlsx", ".xls"]:
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif extension == ".pdf":
            media_type = "application/pdf"
        
        # 记录审计日志
        audit_logger.log_report_download(
            report_id=report_id,
            file_path=report_file
        )
        
        # 返回文件响应
        return FileResponse(
            path=report_file,
            filename=filename,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        logger.error(f"Error in download_report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# API端点：获取报告元数据
@app.get("/api/report/metadata/{report_id}", tags=["Report Management"])
async def get_report_metadata(report_id: str):
    """获取报告元数据"""
    # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询报告元数据
    # 这里返回示例数据
    return {
        "report_id": report_id,
        "report_type": "daily",
        "format": "json",
        "start_date": int(time.time() - 86400),  # 24小时前
        "end_date": int(time.time()),
        "created_at": int(time.time() - 300),  # 5分钟前创建
        "completed_at": int(time.time() - 60),  # 1分钟前完成
        "size_bytes": 10240,  # 示例文件大小
        "generated_by": "report_generation_service"
    }

# API端点：列出可用报告
@app.get("/api/report/list", tags=["Report Management"])
async def list_reports(
    report_type: Optional[str] = Query(None, description="Filter by report type"),
    format: Optional[str] = Query(None, description="Filter by report format"),
    start_date: Optional[int] = Query(None, description="Filter reports created after this timestamp"),
    end_date: Optional[int] = Query(None, description="Filter reports created before this timestamp"),
    limit: int = Query(20, description="Maximum number of reports to return"),
    offset: int = Query(0, description="Offset for pagination")
):
    """列出可用的报告"""
    # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询报告列表
    # 这里返回示例数据
    sample_reports = [
        {
            "report_id": "report-1",
            "report_type": "daily",
            "format": "json",
            "created_at": int(time.time() - 86400),
            "completed_at": int(time.time() - 86340),
            "size_bytes": 10240
        },
        {
            "report_id": "report-2",
            "report_type": "weekly",
            "format": "csv",
            "created_at": int(time.time() - 172800),
            "completed_at": int(time.time() - 172000),
            "size_bytes": 8192
        },
        {
            "report_id": "report-3",
            "report_type": "monthly",
            "format": "xlsx",
            "created_at": int(time.time() - 2592000),
            "completed_at": int(time.time() - 2591000),
            "size_bytes": 20480
        }
    ]
    
    # 应用过滤条件
    filtered_reports = sample_reports
    if report_type:
        filtered_reports = [r for r in filtered_reports if r["report_type"] == report_type]
    if format:
        filtered_reports = [r for r in filtered_reports if r["format"] == format]
    if start_date:
        filtered_reports = [r for r in filtered_reports if r["created_at"] >= start_date]
    if end_date:
        filtered_reports = [r for r in filtered_reports if r["created_at"] <= end_date]
    
    # 应用分页
    paginated_reports = filtered_reports[offset:offset + limit]
    
    return {
        "reports": paginated_reports,
        "total_count": len(filtered_reports),
        "returned_count": len(paginated_reports),
        "offset": offset,
        "limit": limit,
        "timestamp": int(time.time())
    }

# 应用启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("Report Generation Service starting up...")
    
    # 连接到消息队列
    if not mq_client.connect():
        logger.error("Failed to connect to message queue")
        # 在实际应用中，可能需要根据配置决定是否继续启动服务
    
    # 启动队列处理任务
    loop = asyncio.get_event_loop()
    loop.create_task(process_report_queue())
    
    logger.info("Report Generation Service started successfully")

# 应用关闭事件
@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    logger.info("Report Generation Service shutting down...")
    
    # 关闭消息队列连接
    mq_client.close()
    
    logger.info("Report Generation Service shut down successfully")

# 主函数，用于直接运行应用
if __name__ == "__main__":
    # 从命令行参数或配置获取主机和端口
    host = config_manager.get('report_generation.host', '0.0.0.0')
    port = config_manager.get('report_generation.port', 8004)
    
    logger.info(f"Starting Report Generation Service on {host}:{port}")
    
    # 运行UVicorn服务器
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=config_manager.is_debug(),  # 调试模式下自动重载
        workers=config_manager.get('report_generation.workers', 1)  # 工作进程数
    )