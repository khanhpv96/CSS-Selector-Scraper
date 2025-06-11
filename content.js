class DataScraper {
  constructor() {
    this.isActive = false;
    this.scrapedData = new Map();
    this.columns = [];
    this.scrollSpeed = 1000;
    this.lastScrollHeight = 0;
    this.scrollAttempts = 0;
    this.maxScrollAttempts = 3;
    this.linkFilter = '';
    this.parentSelector = '';
    this.scrapingMode = 'normal';
  }

  async startScraping(columns, scrollSpeed, linkFilter = '', parentSelector = '', scrapingMode = 'normal') {
    this.isActive = true;
    this.columns = columns;
    this.scrollSpeed = scrollSpeed;
    this.linkFilter = linkFilter;
    this.parentSelector = parentSelector;
    this.scrapingMode = scrapingMode;
    this.scrapedData.clear();
    this.lastScrollHeight = 0;
    this.scrollAttempts = 0;

    this.sendMessage({
      type: 'SCRAPING_STATUS',
      status: 'running',
      message: 'Đang bắt đầu thu thập...'
    });

    await this.scrapeCurrentView();
    await this.autoScroll();
  }

  stopScraping() {
    this.isActive = false;
    this.sendMessage({
      type: 'SCRAPING_STATUS',
      status: 'stopped',
      message: 'Đã dừng thu thập'
    });
  }

  sendMessage(message) {
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  async scrapeCurrentView() {
    if (!this.isActive) return;

    const newData = [];
    
    if (this.scrapingMode === 'parent' && this.parentSelector) {
      const parentElements = document.querySelectorAll(this.parentSelector);
      
      parentElements.forEach((parentElement, parentIndex) => {
        const rowData = {};
        let hasData = false;

        this.columns.forEach(column => {
          try {
            const childElements = parentElement.querySelectorAll(column.selector);
            
            if (childElements.length > 0) {
              const element = childElements[0];
              let value = '';

              switch (column.attribute.toLowerCase()) {
                case 'innertext':
                  value = element.innerText?.trim() || '';
                  break;
                case 'href':
                  value = element.href || element.getAttribute('href') || '';
                  if (value && !value.startsWith('http') && !value.startsWith('mailto:') && !value.startsWith('tel:')) {
                    try {
                      value = new URL(value, window.location.origin).href;
                    } catch (e) {
                      value = '';
                    }
                  }
                  break;
                case 'src':
                  value = element.src || element.getAttribute('src') || '';
                  if (value && !value.startsWith('http') && !value.startsWith('data:')) {
                    try {
                      value = new URL(value, window.location.origin).href;
                    } catch (e) {
                      value = '';
                    }
                  }
                  break;
              }

              if (value) {
                rowData[column.name] = value;
                hasData = true;
              }
            }
          } catch (error) {
            console.warn('Error with selector:', column.selector, error);
          }
        });

        if (hasData) {
          const uniqueKey = `parent_${parentIndex}_${JSON.stringify(rowData)}`;
          
          if (!this.scrapedData.has(uniqueKey)) {
            this.scrapedData.set(uniqueKey, rowData);
            newData.push(rowData);
          }
        }
      });
    } else {
      this.columns.forEach(column => {
        try {
          const elements = document.querySelectorAll(column.selector);
          
          elements.forEach((element, index) => {
            let value = '';

            switch (column.attribute.toLowerCase()) {
              case 'innertext':
                value = element.innerText?.trim() || '';
                break;
              case 'href':
                value = element.href || element.getAttribute('href') || '';
                if (value && !value.startsWith('http') && !value.startsWith('mailto:') && !value.startsWith('tel:')) {
                  try {
                    value = new URL(value, window.location.origin).href;
                  } catch (e) {
                    value = '';
                  }
                }
                if (this.linkFilter && value && !value.toLowerCase().includes(this.linkFilter.toLowerCase())) {
                  value = '';
                }
                break;
              case 'src':
                value = element.src || element.getAttribute('src') || '';
                if (value && !value.startsWith('http') && !value.startsWith('data:')) {
                  try {
                    value = new URL(value, window.location.origin).href;
                  } catch (e) {
                    value = '';
                  }
                }
                break;
            }

            if (value) {
              const uniqueKey = `${column.selector}_${index}_${value}`;
              
              if (!this.scrapedData.has(uniqueKey)) {
                const rowData = {
                  [column.name]: value,
                  _selector: column.selector,
                  _index: index
                };
                
                this.scrapedData.set(uniqueKey, rowData);
                newData.push(rowData);
              }
            }
          });
        } catch (error) {
          console.warn('Error with selector:', column.selector, error);
        }
      });
    }

    if (newData.length > 0) {
      if (this.scrapingMode === 'parent') {
        this.sendMessage({
          type: 'NEW_DATA',
          data: newData,
          totalCount: this.scrapedData.size
        });
      } else {
        const groupedData = this.groupDataByIndex(newData);
        this.sendMessage({
          type: 'NEW_DATA',
          data: groupedData,
          totalCount: this.scrapedData.size
        });
      }
    }
  }

  groupDataByIndex(data) {
    const grouped = new Map();
    
    data.forEach(item => {
      const key = `${item._selector}_${item._index}`;
      
      if (!grouped.has(key)) {
        grouped.set(key, {});
      }
      
      const existing = grouped.get(key);
      this.columns.forEach(column => {
        if (item[column.name]) {
          existing[column.name] = item[column.name];
        }
      });
      
      grouped.set(key, existing);
    });

    return Array.from(grouped.values()).filter(row => {
      return this.columns.some(col => row[col.name]);
    });
  }

  async autoScroll() {
    let scrollCount = 0;
    
    while (this.isActive && scrollCount < 200) {
      scrollCount++;
      
      const beforeScrollHeight = document.documentElement.scrollHeight;
      const beforeScrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;

      if (beforeScrollTop + windowHeight >= beforeScrollHeight - 100) {
        if (this.lastScrollHeight === beforeScrollHeight) {
          this.scrollAttempts++;
          
          if (this.scrollAttempts >= this.maxScrollAttempts) {
            break;
          }
        } else {
          this.scrollAttempts = 0;
        }
        this.lastScrollHeight = beforeScrollHeight;
      }

      window.scrollBy(0, 400);
      await this.delay(Math.max(this.scrollSpeed, 500));
      await this.scrapeCurrentView();

      const afterScrollHeight = document.documentElement.scrollHeight;
      const afterScrollTop = window.pageYOffset || document.documentElement.scrollTop;

      if (afterScrollHeight === beforeScrollHeight && 
          afterScrollTop + windowHeight >= afterScrollHeight - 50) {
        await this.delay(2000);
        
        if (document.documentElement.scrollHeight === afterScrollHeight) {
          break;
        }
      }
    }

    if (this.isActive) {
      this.sendMessage({
        type: 'SCRAPING_COMPLETE',
        totalCount: this.scrapedData.size
      });
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const scraper = new DataScraper();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_SCRAPING':
      scraper.startScraping(message.columns, message.scrollSpeed, message.linkFilter, message.parentSelector, message.scrapingMode);
      sendResponse({ success: true });
      break;
    case 'STOP_SCRAPING':
      scraper.stopScraping();
      sendResponse({ success: true });
      break;
  }
  return true;
});