import { db } from '../database/db';

export interface Quote {
  id: string;
  user_id: string;
  product_id: string;
  principal: number;
  leverage: number;
  premium: number;
  payout: number;
  params_json: string;
  expires_at: string;
  created_at: string;
}

export interface CreateQuoteData {
  user_id: string;
  product_id: string;
  principal: number;
  leverage: number;
  premium: number;
  payout: number;
  params: any;
  expires_at: Date;
}

export class QuoteModel {
  static async create(data: CreateQuoteData): Promise<Quote> {
    const id = `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO quotes (
          id, user_id, product_id, principal, leverage, 
          premium, payout, params_json, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.user_id,
          data.product_id,
          data.principal,
          data.leverage,
          data.premium,
          data.payout,
          JSON.stringify(data.params),
          data.expires_at.toISOString(),
          new Date().toISOString()
        ],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          
          // 获取创建的报价
          db.get(
            'SELECT * FROM quotes WHERE id = ?',
            [id],
            (err, row) => {
              if (err) reject(err);
              else resolve(row as Quote);
            }
          );
        }
      );
    });
  }

  static async findById(id: string): Promise<Quote | null> {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM quotes WHERE id = ?',
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row as Quote || null);
        }
      );
    });
  }

  static async findByUserId(userId: string): Promise<Quote[]> {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM quotes WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows as Quote[]);
        }
      );
    });
  }

  static async findValidById(id: string): Promise<Quote | null> {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM quotes WHERE id = ? AND expires_at > ?',
        [id, new Date().toISOString()],
        (err, row) => {
          if (err) reject(err);
          else resolve(row as Quote || null);
        }
      );
    });
  }

  static async cleanupExpiredQuotes(): Promise<number> {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM quotes WHERE expires_at <= ?',
        [new Date().toISOString()],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  static async getQuoteStats(productId: string): Promise<{
    total_quotes: number;
    total_principal: number;
    total_premium: number;
    avg_leverage: number;
  }> {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT 
          COUNT(*) as total_quotes,
          SUM(principal) as total_principal,
          SUM(premium) as total_premium,
          AVG(leverage) as avg_leverage
        FROM quotes 
        WHERE product_id = ? AND expires_at > ?`,
        [productId, new Date().toISOString()],
        (err, row: any) => {
          if (err) reject(err);
          else {
            resolve({
              total_quotes: row.total_quotes || 0,
              total_principal: row.total_principal || 0,
              total_premium: row.total_premium || 0,
              avg_leverage: row.avg_leverage || 0
            });
          }
        }
      );
    });
  }
}

export default QuoteModel;