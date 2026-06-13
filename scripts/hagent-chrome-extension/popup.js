document.addEventListener('DOMContentLoaded', () => {
  const syncFbBtn = document.getElementById('sync-fb-btn');
  const syncZaloBtn = document.getElementById('sync-zalo-btn');
  const statusDiv = document.getElementById('status');
  const urlInput = document.getElementById('hagent-url');
  const tokenInput = document.getElementById('hagent-token');

  // Load saved config
  chrome.storage.local.get(['hagent_url', 'hagent_token'], (res) => {
    if (res.hagent_url) urlInput.value = res.hagent_url;
    if (res.hagent_token) tokenInput.value = res.hagent_token;
  });

  async function performSync(platform) {
    const hagentUrl = urlInput.value.trim().replace(/\/$/, "");
    const token = tokenInput.value.trim();

    // Save configuration
    chrome.storage.local.set({ hagent_url: hagentUrl, hagent_token: token });

    statusDiv.style.color = '#e2e8f0';
    statusDiv.textContent = `Đang đọc Cookie từ tab ${platform === 'facebook' ? 'Facebook' : 'Zalo'}...`;
    
    syncFbBtn.disabled = true;
    syncZaloBtn.disabled = true;

    try {
      // Use full URL instead of domain for more reliable cookie matching in Chrome
      const targetUrl = platform === 'facebook' ? 'https://www.facebook.com' : 'https://chat.zalo.me';
      const cookies = await new Promise((resolve) => {
        chrome.cookies.getAll({ url: targetUrl }, (cookiesList) => {
          resolve(cookiesList);
        });
      });

      if (!cookies || cookies.length === 0) {
        throw new Error(`Không tìm thấy cookie nào của ${platform === 'facebook' ? 'Facebook' : 'Zalo'}. Hãy mở tab ${platform === 'facebook' ? 'facebook.com' : 'chat.zalo.me'} và đăng nhập trước.`);
      }

      // Check required cookies
      const cookieMap = {};
      cookies.forEach(c => {
        cookieMap[c.name] = c.value;
      });

      if (platform === 'facebook' && (!cookieMap.c_user || !cookieMap.xs)) {
        throw new Error('Thiếu cookie c_user hoặc xs. Hãy đăng nhập lại Facebook.');
      }
      
      if (platform === 'zalo' && !cookieMap.PHPSESSID) {
        throw new Error('Thiếu cookie PHPSESSID. Hãy đăng nhập lại Zalo.');
      }

      // Format header cookie string
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      // 2. Fetch HAgent JWT Token if not provided (try from HAgent app domain tab)
      let jwtToken = token;
      if (!jwtToken) {
        statusDiv.textContent = 'Đang tự tìm JWT Token trên tab HAgent...';
        try {
          const tabs = await new Promise((resolve) => {
            chrome.tabs.query({}, (tabsList) => resolve(tabsList));
          });
          
          // Find HAgent tab (either localhost:3004 or 127.0.0.1:3004 or hatai.io.vn)
          const hagentTab = tabs.find(t => 
            t.url && (t.url.includes('localhost:3004') || t.url.includes('127.0.0.1:3004') || t.url.includes('hatai.io.vn'))
          );

          if (hagentTab) {
            // Execute script to get token from localStorage
            const results = await chrome.scripting.executeScript({
              target: { tabId: hagentTab.id },
              func: () => localStorage.getItem('token') || ''
            });
            if (results && results[0] && results[0].result) {
              jwtToken = results[0].result;
            }
          }
        } catch (tokenErr) {
          console.warn('Lỗi tự động lấy token:', tokenErr);
          // Do not crash, let the user know they can paste it manually if empty
        }
      }

      if (!jwtToken) {
        throw new Error('Không lấy được JWT Token. Hãy copy token từ localStorage.getItem("token") trên HAgent Web và dán vào ô Token.');
      }

      // 3. Send Cookie to HAgent API
      statusDiv.textContent = `Đang gửi Cookie ${platform === 'facebook' ? 'Facebook' : 'Zalo'} về HAgent...`;
      const apiEndpoint = `${hagentUrl}/api/omni/connect/${platform}`;
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ cookie: cookieStr })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || `Lỗi API gửi cookie ${platform}`);
      }

      statusDiv.style.color = '#4ade80';
      statusDiv.textContent = `✅ Kết nối ${platform === 'facebook' ? 'Facebook' : 'Zalo'} thành công! Listener đã được bật.`;
    } catch (err) {
      statusDiv.style.color = '#f87171';
      statusDiv.textContent = `❌ ${err.message}`;
    } finally {
      syncFbBtn.disabled = false;
      syncZaloBtn.disabled = false;
    }
  }

  syncFbBtn.addEventListener('click', () => performSync('facebook'));
  syncZaloBtn.addEventListener('click', () => performSync('zalo'));
});
