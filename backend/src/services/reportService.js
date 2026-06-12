const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

class ReportService {
  async generateSalesReport(startDate, endDate, format = 'json') {
    const result = await EventModel.db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transactions,
        SUM(amount) as total_sales,
        AVG(amount) as avg_ticket,
        COUNT(DISTINCT user_id) as unique_customers
      FROM payments
      WHERE status = 'completed'
        AND created_at BETWEEN $1 AND $2
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [startDate, endDate]);

    if (format === 'excel') {
      return await this.exportToExcel(result.rows, 'sales_report');
    }
    
    return result.rows;
  }

  async generateEventsReport(startDate, endDate, format = 'json') {
    const result = await EventModel.db.query(`
      SELECT 
        e.id,
        e.title,
        e.event_date,
        e.venue_name,
        e.total_tickets,
        e.tickets_sold,
        ROUND((e.tickets_sold::DECIMAL / e.total_tickets) * 100, 2) as sell_through,
        COALESCE(SUM(p.amount), 0) as revenue,
        u.full_name as organizer_name
      FROM events e
      JOIN users u ON u.id = e.organizer_id
      LEFT JOIN payments p ON p.event_id = e.id AND p.status = 'completed'
      WHERE e.event_date BETWEEN $1 AND $2
      GROUP BY e.id, u.full_name
      ORDER BY e.event_date ASC
    `, [startDate, endDate]);

    if (format === 'excel') {
      return await this.exportToExcel(result.rows, 'events_report');
    }
    
    return result.rows;
  }

  async generateUsersReport(format = 'json') {
    const result = await EventModel.db.query(`
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.phone_number,
        u.role,
        u.created_at as joined_date,
        u.wallet_balance,
        u.total_spent,
        COUNT(DISTINCT t.id) as tickets_purchased,
        COALESCE(SUM(p.amount), 0) as total_spent_amount
      FROM users u
      LEFT JOIN tickets t ON t.user_id = u.id
      LEFT JOIN payments p ON p.user_id = u.id AND p.status = 'completed'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    return result.rows;
  }

  async generateWithdrawalsReport(startDate, endDate, format = 'json') {
    const result = await EventModel.db.query(`
      SELECT 
        w.id,
        w.amount,
        w.phone_number,
        w.status,
        w.created_at as requested_date,
        w.processed_at,
        w.completed_at,
        u.full_name,
        u.email
      FROM withdrawals w
      JOIN users u ON u.id = w.user_id
      WHERE w.created_at BETWEEN $1 AND $2
      ORDER BY w.created_at DESC
    `, [startDate, endDate]);

    if (format === 'excel') {
      return await this.exportToExcel(result.rows, 'withdrawals_report');
    }
    
    return result.rows;
  }

  async exportToExcel(data, sheetName) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    if (data.length === 0) {
      worksheet.addRow(['No data available']);
      return workbook;
    }

    // Add headers
    const headers = Object.keys(data[0]);
    worksheet.addRow(headers);

    // Style headers
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF667EEA' },
    };

    // Add data
    data.forEach(row => {
      const values = headers.map(header => row[header]);
      worksheet.addRow(values);
    });

    // Auto-size columns
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(maxLength + 2, 50);
    });

    return workbook;
  }

  async saveReport(workbook, filename) {
    const reportsDir = path.join(__dirname, '../../reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filepath = path.join(reportsDir, filename);
    await workbook.xlsx.writeFile(filepath);
    return filepath;
  }
}

module.exports = new ReportService();