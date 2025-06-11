chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_SCRAPING') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'START_SCRAPING',
          columns: message.columns,
          scrollSpeed: message.scrollSpeed,
          linkFilter: message.linkFilter,
          parentSelector: message.parentSelector,
          scrapingMode: message.scrapingMode
        });
      }
    });
  } else if (message.type === 'STOP_SCRAPING') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_SCRAPING' });
      }
    });
  } else if (message.type === 'NEW_DATA' || message.type === 'SCRAPING_STATUS' || message.type === 'SCRAPING_COMPLETE') {
    chrome.runtime.sendMessage(message);
  }
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    scrapedData: [],
    isScrapingActive: false,
    projectName: 'Dự án mới',
    columns: [],
    scrapingMode: 'normal',
    parentSelector: '',
    linkFilter: ''
  });
});