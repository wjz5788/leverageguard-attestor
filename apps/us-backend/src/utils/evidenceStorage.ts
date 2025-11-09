import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * 证据存储工具类
 * 负责将验证证据保存到文件系统
 */
export class EvidenceStorage {
  private baseDir: string;

  constructor(baseDir: string = path.join(process.cwd(), 'reports', 'evidence')) {
    this.baseDir = baseDir;
    this.ensureDirectoryExists();
  }

  /**
   * 确保证据目录存在
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * 获取当前日期的目录路径
   */
  private getDateDir(): string {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // yyyy-mm-dd
    const dateDir = path.join(this.baseDir, dateStr);
    
    if (!fs.existsSync(dateDir)) {
      fs.mkdirSync(dateDir, { recursive: true });
    }
    
    return dateDir;
  }

  /**
   * 保存证据文件
   * @param evidenceId 证据ID
   * @param evidenceData 证据数据
   * @returns 保存的文件路径
   */
  saveEvidence(evidenceId: string, evidenceData: any): string {
    const dateDir = this.getDateDir();
    const filePath = path.join(dateDir, `${evidenceId}.json`);
    
    // 创建去敏感字段的证据副本
    const sanitizedEvidence = this.sanitizeEvidence(evidenceData);
    
    fs.writeFileSync(filePath, JSON.stringify(sanitizedEvidence, null, 2), 'utf8');
    
    // 同时保存根哈希文件
    const rootFilePath = path.join(dateDir, `${evidenceId}.root`);
    if (sanitizedEvidence.evidence?.root) {
      fs.writeFileSync(rootFilePath, sanitizedEvidence.evidence.root, 'utf8');
    }
    
    return filePath;
  }

  /**
   * 去除敏感字段
   */
  private sanitizeEvidence(evidenceData: any): any {
    const sanitized = { ...evidenceData };
    
    // 去除请求中的敏感信息
    if (sanitized.request) {
      const { apiKey, secretKey, passphrase, ...safeRequest } = sanitized.request;
      sanitized.request = safeRequest;
    }
    
    // 去除响应中的敏感信息
    if (sanitized.raw) {
      const safeRaw = { ...sanitized.raw };
      // 可以进一步清理 raw 数据中的敏感字段
      sanitized.raw = safeRaw;
    }
    
    return sanitized;
  }

  /**
   * 读取证据文件
   * @param evidenceId 证据ID
   * @param date 日期（可选，默认为今天）
   */
  readEvidence(evidenceId: string, date?: string): any {
    const dateDir = date ? path.join(this.baseDir, date) : this.getDateDir();
    const filePath = path.join(dateDir, `${evidenceId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * 生成证据ID
   */
  generateEvidenceId(): string {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:]/g, '').split('.')[0]; // yyyymmddTHHMMSS
    const randomPart = uuidv4().slice(0, 8);
    return `evi_${dateStr}_${randomPart}`;
  }

  /**
   * 获取证据目录列表
   */
  listEvidenceDates(): string[] {
    if (!fs.existsSync(this.baseDir)) {
      return [];
    }
    
    return fs.readdirSync(this.baseDir)
      .filter(item => {
        const itemPath = path.join(this.baseDir, item);
        return fs.statSync(itemPath).isDirectory();
      })
      .sort((a, b) => b.localeCompare(a)); // 最新日期在前
  }

  /**
   * 获取指定日期的证据文件列表
   */
  listEvidenceFiles(date: string): string[] {
    const dateDir = path.join(this.baseDir, date);
    if (!fs.existsSync(dateDir)) {
      return [];
    }
    
    return fs.readdirSync(dateDir)
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
  }
}

// 导出默认实例
export const evidenceStorage = new EvidenceStorage();

export default EvidenceStorage;