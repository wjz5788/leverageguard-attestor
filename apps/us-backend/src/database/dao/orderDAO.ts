// 订单DAO实现
import type { Database } from 'sqlite3';
import { BaseDAOImpl, PageRequest, PageResponse } from './base.js';

export interface Order {
  id: string;
  user_id: string;
  wallet_address: string;
  product_id: string;
  principal_usdc: number;      // 6位整数，最小单位
  leverage: number;
  premium_usdc: number;        // 6位整数，保费
  payout_usdc: number;           // 6位整数，赔付金额
  duration_hours: number;
  status: 'pending' | 'paid' | 'active' | 'expired' | 'claimed';
  payment_proof_id?: string;
  evidence_id?: string;
  claim_id?: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  paid_at?: string;
  claimed_at?: string;
}

export interface OrderFilters {
  user_id?: string;
  wallet_address?: string;
  product_id?: string;
  status?: string | string[];
  created_after?: string;
  created_before?: string;
  expires_before?: string;
}

export class OrderDAO extends BaseDAOImpl<Order> {
  constructor(db: Database) {
    super(db, 'orders');
    this.initializeStatements();
  }

  private initializeStatements() {
    // 创建预编译语句以提高性能
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        product_id TEXT NOT NULL,
        principal_usdc INTEGER NOT NULL,
        leverage INTEGER NOT NULL,
        premium_usdc INTEGER NOT NULL,
        payout_usdc INTEGER NOT NULL,
        duration_hours INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_proof_id TEXT,
        evidence_id TEXT,
        claim_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        paid_at TIMESTAMP,
        claimed_at TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `).run();

    // 创建索引
    this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC)`).run();
    this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_wallet ON orders(wallet_address, created_at DESC)`).run();
    this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, updated_at DESC)`).run();
    this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders(expires_at)`).run();
  }

  create(order: Order): Order {
    const stmt = this.db.prepare(`
      INSERT INTO orders (
        id, user_id, wallet_address, product_id, principal_usdc, leverage,
        premium_usdc, payout_usdc, duration_hours, status, payment_proof_id,
        evidence_id, claim_id, created_at, updated_at, expires_at, paid_at, claimed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    const now = new Date().toISOString();
    let changes = 0;
    stmt.run(
      order.id,
      order.user_id,
      order.wallet_address,
      order.product_id,
      order.principal_usdc,
      order.leverage,
      order.premium_usdc,
      order.payout_usdc,
      order.duration_hours,
      order.status,
      order.payment_proof_id || null,
      order.evidence_id || null,
      order.claim_id || null,
      order.created_at || now,
      order.updated_at || now,
      order.expires_at || null,
      order.paid_at || null,
      order.claimed_at || null,
      function(this: any, err: any) {
        if (!err) {
          changes = this.changes;
        }
      }
    );

    if (changes === 0) {
      throw new Error('Failed to create order');
    }

    return this.findById(order.id)!;
  }

  update(id: string, updates: Partial<Order>): Order | undefined {
    const existing = this.findById(id);
    if (!existing) {
      return undefined;
    }

    const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
    
    const stmt = this.db.prepare(`
      UPDATE orders SET
        status = ?, updated_at = ?, expires_at = ?, paid_at = ?, claimed_at = ?,
        payment_proof_id = ?, evidence_id = ?, claim_id = ?
      WHERE id = ?
    `);

    let changes = 0;
    stmt.run(
      updated.status,
      updated.updated_at,
      updated.expires_at || null,
      updated.paid_at || null,
      updated.claimed_at || null,
      updated.payment_proof_id || null,
      updated.evidence_id || null,
      updated.claim_id || null,
      id,
      function(this: any, err: any) {
        if (!err) {
          changes = this.changes;
        }
      }
    );

    return changes > 0 ? updated : undefined;
  }

  findByUserId(userId: string, pageRequest: PageRequest): PageResponse<Order> {
    const { limit, offset } = this.paginate(pageRequest);
    
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM orders WHERE user_id = ?`);
    let total = 0;
    countStmt.get(userId, (err: any, row: any) => {
      if (!err && row) {
        total = (row as { count: number }).count;
      }
    });

    const dataStmt = this.db.prepare(`
      SELECT * FROM orders 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);
    
    let data: Order[] = [];
    dataStmt.all(userId, limit, offset, (err: any, rows: any) => {
      if (!err) {
        data = rows as Order[];
      }
    });

    return {
      data,
      total,
      page: pageRequest.page,
      pageSize: pageRequest.pageSize,
      totalPages: Math.ceil(total / pageRequest.pageSize)
    };
  }

  findByWalletAddress(walletAddress: string, pageRequest: PageRequest): PageResponse<Order> {
    const { limit, offset } = this.paginate(pageRequest);
    
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM orders WHERE wallet_address = ?`);
    let total = 0;
    countStmt.get(walletAddress, (err: any, row: any) => {
      if (!err && row) {
        total = (row as { count: number }).count;
      }
    });

    const dataStmt = this.db.prepare(`
      SELECT * FROM orders 
      WHERE wallet_address = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);
    
    let data: Order[] = [];
    dataStmt.all(walletAddress, limit, offset, (err: any, rows: any) => {
      if (!err) {
        data = rows as Order[];
      }
    });

    return {
      data,
      total,
      page: pageRequest.page,
      pageSize: pageRequest.pageSize,
      totalPages: Math.ceil(total / pageRequest.pageSize)
    };
  }

  findByStatus(status: string | string[], pageRequest: PageRequest): PageResponse<Order> {
    const { limit, offset } = this.paginate(pageRequest);
    
    let countSql = `SELECT COUNT(*) as count FROM orders`;
    let dataSql = `SELECT * FROM orders`;
    const params: any[] = [];

    if (Array.isArray(status)) {
      countSql += ` WHERE status IN (${status.map(() => '?').join(',')})`;
      dataSql += ` WHERE status IN (${status.map(() => '?').join(',')})`;
      params.push(...status);
    } else {
      countSql += ` WHERE status = ?`;
      dataSql += ` WHERE status = ?`;
      params.push(status);
    }

    dataSql += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const countStmt = this.db.prepare(countSql);
    let total = 0;
    countStmt.get(...params.slice(0, -2), (err: any, row: any) => {
      if (!err && row) {
        total = (row as { count: number }).count;
      }
    });

    const dataStmt = this.db.prepare(dataSql);
    let data: Order[] = [];
    dataStmt.all(...params, (err: any, rows: any) => {
      if (!err) {
        data = rows as Order[];
      }
    });

    return {
      data,
      total,
      page: pageRequest.page,
      pageSize: pageRequest.pageSize,
      totalPages: Math.ceil(total / pageRequest.pageSize)
    };
  }

  findWithFilters(filters: OrderFilters, pageRequest: PageRequest): PageResponse<Order> {
    const { limit, offset } = this.paginate(pageRequest);
    
    let sql = `SELECT * FROM orders`;
    let countSql = `SELECT COUNT(*) as count FROM orders`;
    const params: any[] = [];
    const conditions: string[] = [];

    // 构建查询条件
    if (filters.user_id) {
      conditions.push(`user_id = ?`);
      params.push(filters.user_id);
    }

    if (filters.wallet_address) {
      conditions.push(`wallet_address = ?`);
      params.push(filters.wallet_address);
    }

    if (filters.product_id) {
      conditions.push(`product_id = ?`);
      params.push(filters.product_id);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`status IN (${filters.status.map(() => '?').join(',')})`);
        params.push(...filters.status);
      } else {
        conditions.push(`status = ?`);
        params.push(filters.status);
      }
    }

    if (filters.created_after) {
      conditions.push(`created_at >= ?`);
      params.push(filters.created_after);
    }

    if (filters.created_before) {
      conditions.push(`created_at <= ?`);
      params.push(filters.created_before);
    }

    if (filters.expires_before) {
      conditions.push(`expires_at <= ?`);
      params.push(filters.expires_before);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // 获取总数
    const totalStmt = this.db.prepare(`${countSql} ${whereClause}`);
    let total = 0;
    totalStmt.get(...params, (err: any, row: any) => {
      if (!err && row) {
        total = (row as { count: number }).count;
      }
    });

    // 获取数据
    const dataStmt = this.db.prepare(`${sql} ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`);
    let data: Order[] = [];
    dataStmt.all(...params, limit, offset, (err: any, rows: any) => {
      if (!err) {
        data = rows as Order[];
      }
    });

    return {
      data,
      total,
      page: pageRequest.page,
      pageSize: pageRequest.pageSize,
      totalPages: Math.ceil(total / pageRequest.pageSize)
    };
  }

  // 特殊查询方法
  findExpiringOrders(expiresBefore: string, limit = 100): Order[] {
    const stmt = this.db.prepare(`
      SELECT * FROM orders 
      WHERE expires_at <= ? AND status = 'active' 
      ORDER BY expires_at ASC 
      LIMIT ?
    `);
    let data: Order[] = [];
    stmt.all(expiresBefore, limit, (err: any, rows: any) => {
      if (!err) {
        data = rows as Order[];
      }
    });
    return data;
  }

  findUnpaidOrders(createdBefore: string, limit = 100): Order[] {
    const stmt = this.db.prepare(`
      SELECT * FROM orders 
      WHERE created_at <= ? AND status = 'pending' 
      ORDER BY created_at ASC 
      LIMIT ?
    `);
    let data: Order[] = [];
    stmt.all(createdBefore, limit, (err: any, rows: any) => {
      if (!err) {
        data = rows as Order[];
      }
    });
    return data;
  }

  updateStatus(id: string, status: Order['status']): Order | undefined {
    return this.update(id, { status, updated_at: new Date().toISOString() });
  }

  bulkUpdateStatus(ids: string[], status: Order['status']): number {
    const stmt = this.db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = ? 
      WHERE id IN (${ids.map(() => '?').join(',')})
    `);
    
    let changes = 0;
    stmt.run(status, new Date().toISOString(), ...ids, function(this: any) {
      changes = this.changes;
    });
    return changes;
  }

  getOrderStats(userId?: string): {
    total: number;
    byStatus: Record<string, number>;
    totalPrincipal: number;
    totalPremium: number;
  } {
    let sql = `
      SELECT 
        status,
        COUNT(*) as count,
        SUM(principal_usdc) as principal_sum,
        SUM(premium_usdc) as premium_sum
      FROM orders
    `;
    
    const params: any[] = [];
    
    if (userId) {
      sql += ` WHERE user_id = ?`;
      params.push(userId);
    }
    
    sql += ` GROUP BY status`;

    const stmt = this.db.prepare(sql);
    let rows: Array<{
      status: string;
      count: number;
      principal_sum: number;
      premium_sum: number;
    }> = [];
    stmt.all(...params, (err: any, resultRows: any) => {
      if (!err) {
        rows = resultRows as Array<{
          status: string;
          count: number;
          principal_sum: number;
          premium_sum: number;
        }>;
      }
    });

    const byStatus: Record<string, number> = {};
    let total = 0;
    let totalPrincipal = 0;
    let totalPremium = 0;

    rows.forEach(row => {
      byStatus[row.status] = row.count;
      total += row.count;
      totalPrincipal += row.principal_sum || 0;
      totalPremium += row.premium_sum || 0;
    });

    return {
      total,
      byStatus,
      totalPrincipal,
      totalPremium
    };
  }
}