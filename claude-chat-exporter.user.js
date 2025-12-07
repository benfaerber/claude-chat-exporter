// ==UserScript==
// @name         Claude Chat Exporter
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Export Claude.ai conversations with perfect markdown fidelity
// @author       benfaerber
// @match        https://claude.ai/*
// @icon         https://claude.ai/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  function createExportButton() {
    const button = document.createElement("button");
    button.textContent = "📥 Export Chat";
    button.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      background: #2196F3;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: all 0.2s ease;
    `;

    button.addEventListener("mouseenter", () => {
      button.style.background = "#1976D2";
      button.style.transform = "translateY(-2px)";
      button.style.boxShadow = "0 6px 16px rgba(0,0,0,0.2)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.background = "#2196F3";
      button.style.transform = "translateY(0)";
      button.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    });

    button.addEventListener("click", () => {
      button.disabled = true;
      button.textContent = "⏳ Exporting...";

      // Inject the entire exporter script into page context
      const script = document.createElement("script");
      script.textContent = `
function setupClaudeExporter() {
  const originalWriteText = navigator.clipboard.writeText;
  const capturedResponses = [];
  const humanMessages = [];
  let interceptorActive = true;

  const SELECTORS = {
    userMessage: '[data-testid="user-message"]',
    messageGroup: '.group',
    copyButton: 'button[data-testid="action-bar-copy"]',
    editButton: 'button[aria-label="Edit"]',
    editTextarea: 'textarea',
    conversationTitle: '[data-testid="chat-title-button"] .truncate, button[data-testid="chat-title-button"] div.truncate'
  };

  const DELAYS = {
    hover: 50,
    edit: 150,
    copy: 100
  };

  function downloadMarkdown(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getConversationTitle() {
    const titleElement = document.querySelector(SELECTORS.conversationTitle);
    const title = titleElement?.textContent?.trim();

    if (!title || title === 'Claude' || title.includes('New conversation')) {
      return 'claude_conversation';
    }

    return title
      .replace(/[<>:"/\\\\|?*]/g, '_')
      .replace(/\\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .substring(0, 100);
  }

  async function extractMessageContent(messageContainer, messageIndex) {
    try {
      messageContainer.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await delay(DELAYS.hover);

      const messageGroup = messageContainer.closest(SELECTORS.messageGroup);
      const editButton = messageGroup.querySelector(SELECTORS.editButton);

      if (editButton) {
        console.log(\`📝 Extracting message \${messageIndex + 1} via edit\`);
        editButton.click();
        await delay(DELAYS.edit);

        const editTextarea = document.querySelector(SELECTORS.editTextarea);

        let content = '';
        if (editTextarea) {
          content = editTextarea.value;
        }

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await delay(DELAYS.hover);

        if (content) return content;
      }

      throw new Error(\`Edit button not found\`);

    } catch (error) {
      console.error(\`Failed to extract message \${messageIndex + 1}:\`, error);
    } finally {
      messageContainer.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    }
  }

  async function extractAllHumanMessages() {
    const userMessages = document.querySelectorAll(SELECTORS.userMessage);

    console.log(\`🔄 Extracting \${userMessages.length} human messages...\`);

    for (let i = 0; i < userMessages.length; i++) {
      const content = await extractMessageContent(userMessages[i], i);
      if (content) {
        humanMessages.push({
          type: 'user',
          content: content,
          index: i
        });
        updateStatus();
      }
    }

    console.log(\`✅ Extracted \${humanMessages.length} human messages\`);
  }

  navigator.clipboard.writeText = function(text) {
    console.log('Clipboard write intercepted:', text ? text.substring(0, 50) : 'null');
    if (interceptorActive && text && text.length > 20) {
      console.log(\`📋 Captured Claude response \${capturedResponses.length + 1}\`);
      capturedResponses.push({
        type: 'claude',
        content: text,
        timestamp: Date.now()
      });
      updateStatus();
    }
  };

  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = \`
    position: fixed; top: 10px; right: 10px; z-index: 10000;
    background: #2196F3; color: white; padding: 10px 15px;
    border-radius: 5px; font-family: monospace; font-size: 12px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3); max-width: 300px;
  \`;
  document.body.appendChild(statusDiv);

  function updateStatus() {
    statusDiv.textContent = \`Human: \${humanMessages.length} | Claude: \${capturedResponses.length}\`;
  }

  async function triggerClaudeResponseCopy() {
    const copyButtons = document.querySelectorAll(SELECTORS.copyButton);

    if (copyButtons.length === 0) {
      throw new Error('No Claude copy buttons found!');
    }

    console.log(\`🚀 Clicking \${copyButtons.length} Claude copy buttons...\`);

    for (let i = 0; i < copyButtons.length; i++) {
      const button = copyButtons[i];
      try {
        if (button.offsetParent !== null) {
          button.scrollIntoView({ behavior: 'instant', block: 'nearest' });
          button.click();
          console.log(\`🖱️ Clicked copy button \${i + 1}/\${copyButtons.length}\`);
        }
      } catch (error) {
        console.warn(\`Failed to click button \${i + 1}:\`, error);
      }

      if (i < copyButtons.length - 1) {
        await delay(DELAYS.copy);
      }
    }
  }

  function buildMarkdown() {
    let markdown = "# Conversation with Claude\\n\\n";
    const maxLength = Math.max(humanMessages.length, capturedResponses.length);

    for (let i = 0; i < maxLength; i++) {
      if (i < humanMessages.length && humanMessages[i].content) {
        markdown += \`## Human:\\n\\n\${humanMessages[i].content}\\n\\n---\\n\\n\`;
      }
      if (i < capturedResponses.length) {
        markdown += \`## Claude:\\n\\n\${capturedResponses[i].content}\\n\\n---\\n\\n\`;
      }
    }

    return markdown;
  }

  async function waitForClipboardOperations(expectedCount) {
    const maxWaitTime = 5000;
    const checkInterval = 100;
    let elapsed = 0;

    while (elapsed < maxWaitTime) {
      if (capturedResponses.length >= expectedCount) {
        console.log(\`✅ All \${expectedCount} responses captured in \${elapsed}ms\`);
        return;
      }
      await delay(checkInterval);
      elapsed += checkInterval;
    }

    console.warn(\`⚠️ Timeout: Only captured \${capturedResponses.length}/\${expectedCount} responses\`);
  }

  async function startExport() {
    try {
      statusDiv.textContent = 'Extracting human messages...';
      await extractAllHumanMessages();

      statusDiv.textContent = 'Copying Claude responses...';
      await triggerClaudeResponseCopy();

      await delay(200);

      const copyButtons = document.querySelectorAll(SELECTORS.copyButton);
      await waitForClipboardOperations(copyButtons.length);

      completeExport();

    } catch (error) {
      statusDiv.textContent = \`Error: \${error.message}\`;
      statusDiv.style.background = '#f44336';
      console.error('Export failed:', error);
    } finally {
      setTimeout(cleanup, 3000);
    }
  }

  function completeExport() {
    interceptorActive = false;

    if (humanMessages.length === 0 && capturedResponses.length === 0) {
      statusDiv.textContent = 'No messages captured!';
      statusDiv.style.background = '#f44336';
      return;
    }

    const markdown = buildMarkdown();
    const filename = \`\${getConversationTitle()}.md\`;
    downloadMarkdown(markdown, filename);

    statusDiv.textContent = \`✅ Downloaded: \${filename}\`;
    statusDiv.style.background = '#4CAF50';

    console.log('🎉 Export complete!');
  }

  function cleanup() {
    navigator.clipboard.writeText = originalWriteText;
    if (document.body.contains(statusDiv)) {
      document.body.removeChild(statusDiv);
    }
  }

  updateStatus();
  setTimeout(startExport, 1000);
}

setupClaudeExporter();
      `;
      document.documentElement.appendChild(script);
      script.remove();
    });

    document.body.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      setTimeout(createExportButton, 1000),
    );
  } else {
    setTimeout(createExportButton, 1000);
  }
})();
