class SidePanelManager {
  constructor() {
    this.scrapedData = [];
    this.duplicateCount = 0;
    this.isScrapingActive = false;
    this.columnCounter = 0;
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadStoredData();
    this.addInitialColumn();
    this.updateUI();
  }

  bindEvents() {
    document.getElementById('addColumn').addEventListener('click', () => this.addColumn());
    document.getElementById('startScraping').addEventListener('click', () => this.startScraping());
    document.getElementById('stopScraping').addEventListener('click', () => this.stopScraping());
    document.getElementById('clearData').addEventListener('click', () => this.clearData());
    document.getElementById('copyData').addEventListener('click', () => this.copyToClipboard());
    document.getElementById('downloadData').addEventListener('click', () => this.downloadCSV());

    chrome.runtime.onMessage.addListener((message) => {
      this.handleMessage(message);
    });
  }

  async loadStoredData() {
    const stored = await chrome.storage.local.get(['scrapedData', 'projectName', 'columns', 'linkFilter']);
    if (stored.scrapedData) this.scrapedData = stored.scrapedData;
    if (stored.projectName) document.getElementById('projectName').value = stored.projectName;
    if (stored.linkFilter) document.getElementById('linkFilter').value = stored.linkFilter;
    if (stored.columns && stored.columns.length > 0) {
      this.loadColumns(stored.columns);
    }
  }

  loadColumns(columns) {
    const container = document.getElementById('columnsContainer');
    container.innerHTML = '';
    columns.forEach(column => {
      this.addColumn(column.name, column.selector, column.attribute);
    });
  }

  addInitialColumn() {
    if (document.querySelectorAll('.column-item').length === 0) {
      this.addColumn('Link', 'a[href]', 'href');
    }
  }

  addColumn(name = '', selector = '', attribute = 'innerText') {
    this.columnCounter++;
    const container = document.getElementById('columnsContainer');
    const columnId = `column_${this.columnCounter}`;

    const columnHTML = `
      <div class="column-item" data-column-id="${columnId}">
        <div class="column-header">
          <span class="column-title"></span>
          <button type="button" class="remove-column" data-column-id="${columnId}">Xóa</button>
        </div>
        <div class="column-fields">
          <div class="field-group">
            <label class="field-label">Tên cột</label>
            <input type="text" placeholder="VD: Tiêu đề bài viết" value="${name}" class="field-input column-name">
          </div>
          <div class="field-group">
            <label class="field-label">CSS Selector</label>
            <input type="text" placeholder="VD: h1, .title, #main-title" value="${selector}" class="field-input column-selector">
          </div>
          <div class="field-group">
            <label class="field-label">Thuộc tính</label>
            <select class="field-input column-attribute">
              <option value="innerText" ${attribute === 'innerText' ? 'selected' : ''}>innerText (Nội dung văn bản)</option>
              <option value="href" ${attribute === 'href' ? 'selected' : ''}>href (Đường link)</option>
              <option value="src" ${attribute === 'src' ? 'selected' : ''}>src (Đường dẫn hình ảnh)</option>
            </select>
          </div>
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', columnHTML);
    
    const removeBtn = container.querySelector(`[data-column-id="${columnId}"] .remove-column`);
    removeBtn.addEventListener('click', () => this.removeColumn(columnId));
    
    this.updateColumnTitles();
    this.saveConfiguration();
  }

  removeColumn(columnId) {
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (columnElement) {
      columnElement.remove();
      this.updateColumnTitles();
      this.saveConfiguration();
    }

    if (document.querySelectorAll('.column-item').length === 0) {
      this.addInitialColumn();
    }
  }

  updateColumnTitles() {
    const columnItems = document.querySelectorAll('.column-item');
    columnItems.forEach((item, index) => {
      const titleElement = item.querySelector('.column-title');
      titleElement.textContent = `Cột ${index + 1}`;
    });
  }

  getColumns() {
    const columns = [];
    document.querySelectorAll('.column-item').forEach(item => {
      const name = item.querySelector('.column-name').value.trim();
      const selector = item.querySelector('.column-selector').value.trim();
      const attribute = item.querySelector('.column-attribute').value;

      if (name && selector) {
        columns.push({ name, selector, attribute });
      }
    });
    return columns;
  }

  async saveConfiguration() {
    const projectName = document.getElementById('projectName').value;
    const linkFilter = document.getElementById('linkFilter').value;
    const columns = this.getColumns();
    
    await chrome.storage.local.set({
      projectName,
      linkFilter,
      columns,
      scrapedData: this.scrapedData
    });
  }

  async startScraping() {
    const columns = this.getColumns();
    if (columns.length === 0) {
      this.showStatus('error', 'Vui lòng thêm ít nhất một cột dữ liệu');
      return;
    }

    const scrollSpeed = parseInt(document.getElementById('scrollSpeed').value) || 1000;
    const linkFilter = document.getElementById('linkFilter').value.trim();
    
    this.isScrapingActive = true;
    this.scrapedData = [];
    this.duplicateCount = 0;
    
    await this.saveConfiguration();
    this.updateUI();

    chrome.runtime.sendMessage({
      type: 'START_SCRAPING',
      columns,
      scrollSpeed,
      linkFilter
    });

    this.showStatus('running', 'Đang thu thập dữ liệu...');
  }

  stopScraping() {
    this.isScrapingActive = false;
    chrome.runtime.sendMessage({ type: 'STOP_SCRAPING' });
    this.showStatus('ready', 'Đã dừng thu thập');
    this.updateUI();
  }

  async clearData() {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ dữ liệu đã thu thập?')) {
      this.scrapedData = [];
      this.duplicateCount = 0;
      await chrome.storage.local.set({ scrapedData: [] });
      this.updateDataPreview();
      this.updateUI();
      this.showStatus('ready', 'Đã xóa dữ liệu');
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'NEW_DATA':
        const uniqueData = this.removeDuplicates(message.data);
        this.scrapedData.push(...uniqueData);
        this.updateDataPreview();
        this.updateRecordCount();
        break;
      case 'SCRAPING_STATUS':
        this.showStatus(message.status, message.message);
        break;
      case 'SCRAPING_COMPLETE':
        this.isScrapingActive = false;
        this.showStatus('success', `Hoàn thành! Thu thập được ${this.scrapedData.length} bản ghi`);
        this.updateUI();
        break;
    }
  }

  removeDuplicates(newData) {
    const existingKeys = new Set();
    
    this.scrapedData.forEach(row => {
      const key = this.createRowKey(row);
      existingKeys.add(key);
    });

    return newData.filter(row => {
      const key = this.createRowKey(row);
      if (existingKeys.has(key)) {
        this.duplicateCount++;
        return false;
      }
      existingKeys.add(key);
      return true;
    });
  }

  createRowKey(row) {
    const columns = this.getColumns();
    return columns.map(col => row[col.name] || '').join('|');
  }

  showStatus(status, message) {
    const statusElement = document.getElementById('status');
    const statusText = statusElement.querySelector('.status-text');
    
    statusElement.className = `status-indicator status-${status}`;
    statusText.textContent = message;
  }

  updateRecordCount() {
    document.getElementById('recordCount').textContent = this.scrapedData.length;
    document.getElementById('duplicateCount').textContent = this.duplicateCount;
  }

  updateUI() {
    const startBtn = document.getElementById('startScraping');
    const stopBtn = document.getElementById('stopScraping');
    const copyBtn = document.getElementById('copyData');
    const downloadBtn = document.getElementById('downloadData');
    const progressSection = document.getElementById('progressSection');

    startBtn.disabled = this.isScrapingActive;
    stopBtn.disabled = !this.isScrapingActive;
    copyBtn.disabled = this.scrapedData.length === 0;
    downloadBtn.disabled = this.scrapedData.length === 0;

    progressSection.style.display = this.isScrapingActive ? 'block' : 'none';
  }

  updateDataPreview() {
    const preview = document.getElementById('dataPreview');
    
    if (this.scrapedData.length === 0) {
      preview.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <p>Chưa có dữ liệu nào được thu thập</p>
          <small>Hãy cấu hình các cột dữ liệu và bắt đầu thu thập</small>
        </div>
      `;
      return;
    }

    const columns = this.getColumns();
    if (columns.length === 0) return;

    const tableHTML = `
      <table class="data-table">
        <thead>
          <tr>
            ${columns.map(col => `<th>${col.name}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${this.scrapedData.slice(-50).map(row => `
            <tr>
              ${columns.map(col => `<td title="${this.escapeHtml(row[col.name] || '')}">${this.escapeHtml(this.truncateText(row[col.name] || '', 50))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    preview.innerHTML = tableHTML;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  generateCSV() {
    if (this.scrapedData.length === 0) return '';

    const columns = this.getColumns();
    const headers = columns.map(col => `"${col.name.replace(/"/g, '""')}"`).join(',');
    
    const rows = this.scrapedData.map(row => {
      return columns.map(col => {
        const value = (row[col.name] || '').toString();
        return `"${value.replace(/"/g, '""')}"`;
      }).join(',');
    });

    return '\uFEFF' + headers + '\n' + rows.join('\n');
  }

  async copyToClipboard() {
    try {
      const csvContent = this.generateCSV();
      await navigator.clipboard.writeText(csvContent);
      this.showStatus('success', 'Đã sao chép dữ liệu CSV');
    } catch (error) {
      console.error('Copy failed:', error);
      this.showStatus('error', 'Không thể sao chép dữ liệu');
    }
  }

  downloadCSV() {
    const csvContent = this.generateCSV();
    const projectName = document.getElementById('projectName').value || 'data';
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `${projectName}_${timestamp}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(link.href);
    this.showStatus('success', `Đã tải xuống ${filename}`);
  }
}

const sidePanel = new SidePanelManager();