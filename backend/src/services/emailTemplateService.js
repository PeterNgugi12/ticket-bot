const fs = require('fs').promises;
const path = require('path');
const handlebars = require('handlebars');
const emailUtils = require('../utils/emailUtils');

class EmailTemplateService {
  constructor() {
    this.templates = new Map();
    this.cacheTTL = 3600000; // 1 hour
    this.lastCacheClear = Date.now();
    this.templateDir = path.join(__dirname, '../templates/email');
    this.layoutDir = path.join(this.templateDir, 'layouts');
    this.registerHelpers();
  }

  registerHelpers() {
    // Format currency
    handlebars.registerHelper('formatCurrency', (amount) => {
      return `KES ${amount.toLocaleString()}`;
    });
    
    // Format date
    handlebars.registerHelper('formatDate', (date, format = 'full') => {
      const d = new Date(date);
      if (format === 'full') {
        return d.toLocaleDateString('en-KE', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      return d.toLocaleDateString('en-KE');
    });
    
    // Truncate text
    handlebars.registerHelper('truncate', (text, length) => {
      if (text.length <= length) return text;
      return text.substring(0, length) + '...';
    });
    
    // Uppercase
    handlebars.registerHelper('uppercase', (text) => {
      return text.toUpperCase();
    });
    
    // Lowercase
    handlebars.registerHelper('lowercase', (text) => {
      return text.toLowerCase();
    });
    
    // Conditional class
    handlebars.registerHelper('ifEquals', (arg1, arg2, options) => {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });
    
    // Array length
    handlebars.registerHelper('length', (array) => {
      return array ? array.length : 0;
    });
  }

  async loadTemplate(templateName) {
    // Check cache
    if (this.templates.has(templateName)) {
      const cached = this.templates.get(templateName);
      if (Date.now() - cached.loadedAt < this.cacheTTL) {
        return cached.template;
      }
    }
    
    // Load template file
    const templatePath = path.join(this.templateDir, `${templateName}.hbs`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    
    // Compile template
    const template = handlebars.compile(templateContent);
    
    // Cache template
    this.templates.set(templateName, {
      template,
      loadedAt: Date.now(),
    });
    
    return template;
  }

  async loadLayout(layoutName = 'main') {
    const layoutPath = path.join(this.layoutDir, `${layoutName}.hbs`);
    const layoutContent = await fs.readFile(layoutPath, 'utf-8');
    return handlebars.compile(layoutContent);
  }

  async renderTemplate(templateName, data, layoutName = 'main') {
    const template = await this.loadTemplate(templateName);
    const content = template(data);
    
    // Wrap with layout
    const layout = await this.loadLayout(layoutName);
    const html = layout({ ...data, body: content });
    
    // Generate plain text version
    const text = emailUtils.convertToText(html);
    
    return { html, text };
  }

  async renderRaw(templateName, data) {
    const template = await this.loadTemplate(templateName);
    return template(data);
  }

  async previewTemplate(templateName, data) {
    const { html } = await this.renderTemplate(templateName, data);
    return html;
  }

  clearCache() {
    this.templates.clear();
    this.lastCacheClear = Date.now();
  }

  async listTemplates() {
    const files = await fs.readdir(this.templateDir);
    return files.filter(f => f.endsWith('.hbs')).map(f => f.replace('.hbs', ''));
  }

  async createTemplate(templateName, content) {
    const templatePath = path.join(this.templateDir, `${templateName}.hbs`);
    await fs.writeFile(templatePath, content, 'utf-8');
    this.clearCache();
    return true;
  }

  async updateTemplate(templateName, content) {
    return await this.createTemplate(templateName, content);
  }

  async deleteTemplate(templateName) {
    const templatePath = path.join(this.templateDir, `${templateName}.hbs`);
    await fs.unlink(templatePath);
    this.clearCache();
    return true;
  }
}

module.exports = new EmailTemplateService();