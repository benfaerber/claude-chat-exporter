// ==UserScript==
// @name         Claude Chat Exporter
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Export Claude.ai conversations with perfect markdown fidelity
// @author       Your name
// @match        https://claude.ai/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=claude.ai
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  function setupClaudeExporter() {
    const originalWriteText = navigator.clipboard.writeText;
    const capturedResponses = [];
    const humanMessages = [];
    let interceptorActive = true;

    // DOM Selectors - easily modifiable if Claude's UI changes
    const SELECTORS = {
      userMessage: '[data-testid="user-message"]',
      messageGroup: '.group',
      copyButton: 'button[data-testid="action-bar-copy"]',
      editButton: 'button[aria-label="Edit"]',
      editTextarea: 'textarea',
      conversationTitle: '[data-testid="chat-title-button"] .truncate, button[data-testid="chat-title-button"] div.truncate'
    };

    const DELAYS = {
      hover: 50,    // Time to wait for hover effects
      edit: 150,    // Time for edit interface to load
      copy: 100     // Time between copy operations
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

      // Sanitize filename: remove/replace invalid characters
      return title
        .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid filename chars
        .replace(/\s+/g, '_')           // Replace spaces with underscores
        .replace(/_{2,}/g, '_')         // Replace multiple underscores with single
        .replace(/^_+|_+$/g, '')        // Trim leading/trailing underscores
        .toLowerCase()
        .substring(0, 100);             // Limit length
    }

    async function extractMessageContent(messageContainer, messageIndex) {
      try {
        // Trigger hover to reveal edit button
        messageContainer.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        await delay(DELAYS.hover);

        const messageGroup = messageContainer.closest(SELECTORS.messageGroup);
        const editButton = messageGroup.querySelector(SELECTORS.editButton);

        if (editButton) {
          console.log(`📝 Extracting message ${messageIndex + 1} via edit`);
          editButton.click();
          await delay(DELAYS.edit);

          // Get content from edit interface
          const editTextarea = document.querySelector(SELECTORS.editTextarea);

          let content = '';
          if (editTextarea) {
            content = editTextarea.value;
          }

          // Close edit mode
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          await delay(DELAYS.hover);

          if (content) return content;
        }

        throw new Error(`Edit button not found`);

      } catch (error) {
        console.error(`Failed to extract message ${messageIndex + 1}:`, error);
      } finally {
        // Clean up hover state
        messageContainer.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      }
    }

    async function extractAllHumanMessages() {
      const userMessages = document.querySelectorAll(SELECTORS.userMessage);

      console.log(`🔄 Extracting ${userMessages.length} human messages...`);

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

      console.log(`✅ Extracted ${humanMessages.length} human messages`);
    }

    // Intercept clipboard writes for Claude responses
    navigator.clipboard.writeText = function(text) {
      if (interceptorActive && text && text.length > 20) {
        console.log(`📋 Captured Claude response ${capturedResponses.length + 1}`);
        capturedResponses.push({
          type: 'claude',
          content: text,
          timestamp: Date.now()
        });
        updateStatus();
      }
    };

    // Create status indicator
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = `
      position: fixed; top: 10px; right: 10px; z-index: 10000;
      background: #2196F3; color: white; padding: 10px 15px;
      border-radius: 5px; font-family: monospace; font-size: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3); max-width: 300px;
    `;
    document.body.appendChild(statusDiv);

    function updateStatus() {
      statusDiv.textContent = `Human: ${humanMessages.length} | Claude: ${capturedResponses.length}`;
    }

    async function triggerClaudeResponseCopy() {
      const copyButtons = document.querySelectorAll(SELECTORS.copyButton);

      if (copyButtons.length === 0) {
        throw new Error('No Claude copy buttons found!');
      }

      console.log(`🚀 Clicking ${copyButtons.length} Claude copy buttons...`);

      // Click all copy buttons with minimal delays
      for (let i = 0; i < copyButtons.length; i++) {
        const button = copyButtons[i];
        try {
          if (button.offsetParent !== null) {
            button.scrollIntoView({ behavior: 'instant', block: 'nearest' });
            button.click();
            console.log(`🖱️ Clicked copy button ${i + 1}/${copyButtons.length}`);
          }
        } catch (error) {
          console.warn(`Failed to click button ${i + 1}:`, error);
        }

        // Only delay between clicks, not after the last one
        if (i < copyButtons.length - 1) {
          await delay(DELAYS.copy);
        }
      }
    }

    function buildMarkdown() {
      let markdown = "# Conversation with Claude\n\n";
      const maxLength = Math.max(humanMessages.length, capturedResponses.length);

      for (let i = 0; i < maxLength; i++) {
        if (i < humanMessages.length && humanMessages[i].content) {
          markdown += `## Human:\n\n${humanMessages[i].content}\n\n---\n\n`;
        }
        if (i < capturedResponses.length) {
          markdown += `## Claude:\n\n${capturedResponses[i].content}\n\n---\n\n`;
        }
      }

      return markdown;
    }

    async function waitForClipboardOperations(expectedCount) {
      const maxWaitTime = 2000; // Maximum wait time
      const checkInterval = 100; // Check every 100ms
      let elapsed = 0;

      while (elapsed < maxWaitTime) {
        if (capturedResponses.length >= expectedCount) {
          console.log(`✅ All ${expectedCount} responses captured in ${elapsed}ms`);
          return;
        }
        await delay(checkInterval);
        elapsed += checkInterval;
      }

      console.warn(`⚠️ Timeout: Only captured ${capturedResponses.length}/${expectedCount} responses`);
    }

    async function startExport() {
      try {
        statusDiv.textContent = 'Extracting human messages...';
        await extractAllHumanMessages();

        statusDiv.textContent = 'Copying Claude responses...';
        await triggerClaudeResponseCopy();

        // Smart wait - only as long as needed
        const copyButtons = document.querySelectorAll(SELECTORS.copyButton);
        await waitForClipboardOperations(copyButtons.length);

        completeExport();

      } catch (error) {
        statusDiv.textContent = `Error: ${error.message}`;
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
      const filename = `${getConversationTitle()}.md`;
      downloadMarkdown(markdown, filename);

      statusDiv.textContent = `✅ Downloaded: ${filename}`;
      statusDiv.style.background = '#4CAF50';

      console.log('🎉 Export complete!');
    }

    function cleanup() {
      navigator.clipboard.writeText = originalWriteText;
      if (document.body.contains(statusDiv)) {
        document.body.removeChild(statusDiv);
      }
    }

    // Initialize
    updateStatus();
    setTimeout(startExport, 1000);
  }

  // Create export button in the UI
  function createExportButton() {
    const button = document.createElement('button');
    button.textContent = '📥 Export Chat';
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

    button.addEventListener('mouseenter', () => {
      button.style.background = '#1976D2';
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#2196F3';
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    });

    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = '⏳ Exporting...';
      setupClaudeExporter();
    });

    document.body.appendChild(button);
  }

  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createExportButton);
  } else {
    createExportButton();
  }
})();
