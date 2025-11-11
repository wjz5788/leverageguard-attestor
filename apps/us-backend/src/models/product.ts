import { db } from '../database/db';

export interface Product {
  id: string;
  code: string; // 'DAY24','H8','MDD','NO-LIQ'
  title: string;
  terms_version: string;
  payout_type: 'fixed' | 'ratio';
  payout_value: number;
  window_hours: number;
  leverage_min: number;
  leverage_max: number;
  principal_min: number;
  principal_max: number;
  base_load: number;
  op_fee: number;
  probability: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface CreateQuoteRequest {
  product_id: string;
  principal: number;
  leverage: number;
}

export interface QuoteResponse {
  id: string;
  premium: number;
  payout: number;
  expires_at: string;
  params: {
    product_id: string;
    principal: number;
    leverage: number;
    probability: number;
    base_load: number;
    op_fee: number;
  };
}

export class ProductModel {
  static async findById(id: string): Promise<Product | null> {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM products WHERE id = ? AND status = ?',
        [id, 'active'],
        (err, row) => {
          if (err) reject(err);
          else resolve(row as Product || null);
        }
      );
    });
  }

  static async findByCode(code: string): Promise<Product | null> {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM products WHERE code = ? AND status = ?',
        [code, 'active'],
        (err, row) => {
          if (err) reject(err);
          else resolve(row as Product || null);
        }
      );
    });
  }

  static async findAllActive(): Promise<Product[]> {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM products WHERE status = ? ORDER BY created_at',
        ['active'],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows as Product[]);
        }
      );
    });
  }

  static validateQuoteRequest(product: Product, principal: number, leverage: number): string | null {
    if (principal < product.principal_min || principal > product.principal_max) {
      return `本金必须在 ${product.principal_min} 到 ${product.principal_max} 之间`;
    }
    
    if (leverage < product.leverage_min || leverage > product.leverage_max) {
      return `杠杆必须在 ${product.leverage_min} 到 ${product.leverage_max} 之间`;
    }
    
    return null;
  }

  static calculatePremium(product: Product, principal: number, leverage: number): { premium: number; payout: number } {
    // 计算赔付金额
    let payout: number;
    if (product.payout_type === 'fixed') {
      payout = product.payout_value;
    } else {
      payout = principal * product.payout_value;
    }

    // 计算保费：premium = probability * payout * (1 + load) + op_fee
    const premium = product.probability * payout * (1 + product.base_load) + product.op_fee;

    return { premium, payout };
  }
}

export default ProductModel;