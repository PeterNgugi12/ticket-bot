const reportService = require('../services/reportService');

class ReportController {
  async generateSalesReport(req, res, next) {
    try {
      const { startDate, endDate, format = 'json' } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'startDate and endDate are required',
        });
      }
      
      const report = await reportService.generateSalesReport(startDate, endDate, format);
      
      if (format === 'excel') {
        const filename = `sales_report_${startDate}_${endDate}.xlsx`;
        const filepath = await reportService.saveReport(report, filename);
        
        res.download(filepath, filename, (err) => {
          if (err) {
            console.error('File download error:', err);
          }
          // Clean up file after download
          setTimeout(() => {
            fs.unlinkSync(filepath);
          }, 60000);
        });
      } else {
        res.status(200).json({
          success: true,
          data: report,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async generateEventsReport(req, res, next) {
    try {
      const { startDate, endDate, format = 'json' } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'startDate and endDate are required',
        });
      }
      
      const report = await reportService.generateEventsReport(startDate, endDate, format);
      
      if (format === 'excel') {
        const filename = `events_report_${startDate}_${endDate}.xlsx`;
        const filepath = await reportService.saveReport(report, filename);
        
        res.download(filepath, filename);
      } else {
        res.status(200).json({
          success: true,
          data: report,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async generateUsersReport(req, res, next) {
    try {
      const { format = 'json' } = req.query;
      
      const report = await reportService.generateUsersReport(format);
      
      if (format === 'excel') {
        const filename = `users_report_${Date.now()}.xlsx`;
        const filepath = await reportService.saveReport(report, filename);
        
        res.download(filepath, filename);
      } else {
        res.status(200).json({
          success: true,
          data: report,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async generateWithdrawalsReport(req, res, next) {
    try {
      const { startDate, endDate, format = 'json' } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'startDate and endDate are required',
        });
      }
      
      const report = await reportService.generateWithdrawalsReport(startDate, endDate, format);
      
      if (format === 'excel') {
        const filename = `withdrawals_report_${startDate}_${endDate}.xlsx`;
        const filepath = await reportService.saveReport(report, filename);
        
        res.download(filepath, filename);
      } else {
        res.status(200).json({
          success: true,
          data: report,
        });
      }
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReportController();