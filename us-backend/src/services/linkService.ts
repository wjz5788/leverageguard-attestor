import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// 定义链接数据类型
export interface PaymentLink {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'expired';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  paymentUrl: string;
}

// 定义创建链接的输入类型
export const CreateLinkSchema = z.object({
  orderId: z.string().min(1, '订单ID不能为空'),
  amount: z.number().positive('金额必须大于0'),
  currency: z.string().default('USD'),
  expiresIn: z.number().default(3600), // 默认1小时过期
});

export type CreateLinkInput = z.infer<typeof CreateLinkSchema>;

// 定义链接服务类
export class LinkService {
  private links: Map<string, PaymentLink> = new Map();

  /**
   * 创建支付链接
   */
  async createLink(input: CreateLinkInput): Promise<PaymentLink> {
    // 验证输入
    const validatedInput = CreateLinkSchema.parse(input);
    
    // 创建链接对象
    const link: PaymentLink = {
      id: uuidv4(),
      orderId: validatedInput.orderId,
      amount: validatedInput.amount,
      currency: validatedInput.currency,
      status: 'pending',
      expiresAt: new Date(Date.now() + validatedInput.expiresIn * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      paymentUrl: `https://pay.example.com/${uuidv4()}`,
    };

    // 存储链接
    this.links.set(link.id, link);
    
    return link;
  }

  /**
   * 根据ID获取链接
   */
  async getLinkById(id: string): Promise<PaymentLink | null> {
    const link = this.links.get(id);
    if (!link) {
      return null;
    }
    
    // 检查是否过期
    if (link.expiresAt < new Date() && link.status === 'pending') {
      link.status = 'expired';
      link.updatedAt = new Date();
      this.links.set(id, link);
    }
    
    return link;
  }

  /**
   * 根据订单ID获取链接
   */
  async getLinkByOrderId(orderId: string): Promise<PaymentLink | null> {
    for (const link of this.links.values()) {
      if (link.orderId === orderId) {
        return this.getLinkById(link.id);
      }
    }
    return null;
  }

  /**
   * 更新链接状态
   */
  async updateLinkStatus(id: string, status: PaymentLink['status']): Promise<PaymentLink | null> {
    const link = this.links.get(id);
    if (!link) {
      return null;
    }
    
    link.status = status;
    link.updatedAt = new Date();
    this.links.set(id, link);
    
    return link;
  }

  /**
   * 获取所有链接
   */
  async getAllLinks(): Promise<PaymentLink[]> {
    const links = Array.from(this.links.values());
    
    // 检查并更新过期状态
    const now = new Date();
    links.forEach(link => {
      if (link.expiresAt < now && link.status === 'pending') {
        link.status = 'expired';
        link.updatedAt = now;
        this.links.set(link.id, link);
      }
    });
    
    return links;
  }

  /**
   * 删除链接
   */
  async deleteLink(id: string): Promise<boolean> {
    return this.links.delete(id);
  }
}