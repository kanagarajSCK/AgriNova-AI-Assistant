(function($) {
    'use strict';

    // ── Welcome template ──
    var WELCOME = '<div class="welcome">'
        + '<div class="welcome-icon"><i class="bi bi-flower2"></i></div>'
        + '<h3>AgriNova AI</h3>'
        + '<p>Your AI-powered agricultural assistant. Ask anything about crop diseases, pest control, soil fertility, weather forecasts, or government schemes.</p>'
        + '<div class="chips">'
        + '<span class="chip" data-text="Recommend the best crop for my soil."><i class="bi bi-tree"></i> Best crop for soil</span>'
        + '<span class="chip" data-text="Identify the disease in this crop image."><i class="bi bi-image"></i> Disease identification</span>'
        + '<span class="chip" data-text="How will today\'s weather affect my crop?"><i class="bi bi-cloud-sun"></i> Weather impact</span>'
        + '<span class="chip" data-text="Explain PM-KISAN eligibility."><i class="bi bi-card-list"></i> PM-KISAN scheme</span>'
        + '</div></div>';

    // ── State variables ──
    var chats = []; // Array of chat sessions
    var activeChatId = ''; // Current active chat session ID
    var mediaRecorder = null;
    var audioChunks = [];
    var isRecording = false;
    var isProcessing = false;
    var selectedImage = null;
    var voiceEnabled = localStorage.getItem('agrinova_voice_enabled') === 'true'; // Default to false (Voice: Off)
    var activeLanguage = localStorage.getItem('agrinova_language') || 'auto'; // Chosen advisory language

    // ── jQuery selectors (declared globally, initialized inside document-ready) ──
    var $messages, $form, $input, $sendBtn, $voiceBtn, $typing, $audio, $clearBtn, $themeBtn, $themeIcon, $imageBtn, $imageInput, $preview, $previewImg, $removeImg, $sidebar, $chatHistoryList, $langSelectBtn;

    // ── Initialization ──
    $(document).ready(function() {
        // Safe late-initialization of jQuery elements
        $messages = $('#chatMessages');
        $form = $('#chatForm');
        $input = $('#userInput');
        $sendBtn = $('#sendBtn');
        $voiceBtn = $('#voiceBtn');
        $typing = $('#typingIndicator');
        $audio = $('#audioPlayer');
        $clearBtn = $('#clearBtn');
        $themeBtn = $('#themeToggle');
        $themeIcon = $('#themeIcon');
        $imageBtn = $('#imageBtn');
        $imageInput = $('#imageInput');
        $preview = $('#imagePreview');
        $previewImg = $('#previewImg');
        $removeImg = $('#removeImage');
        $sidebar = $('#sidebar');
        $chatHistoryList = $('#chatHistoryList');

        $langSelectBtn = $('#langSelectBtn');

        initTheme();
        initSidebarOverlay();
        initChatSessions();
        initSidebarEvents();
        updateVoiceButton();
        updateLanguageUI();

        // Language selector change handler
        $langSelectBtn.on('change', function() {
            var val = $(this).val();
            if (val) {
                activeLanguage = val;
                localStorage.setItem('agrinova_language', val);
                showToast('Language set to ' + $(this).find('option:selected').text().trim() + '.');
            }
        });

        $form.on('submit', handleSend);
        $input.on('keydown', function(e) { 
            if (e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                $form.trigger('submit'); 
            } 
        });
        $voiceBtn.on('click', toggleRecording);
        $clearBtn.on('click', clearActiveConversation);
        $('#sidebarClearBtn').on('click', resetAllConversations);
        $themeBtn.on('click', toggleTheme);
        $imageBtn.on('click', function() { $imageInput.trigger('click'); });
        $imageInput.on('change', handleImageSelect);
        $removeImg.on('click', clearImage);
        
        // Voice toggle action in the top header
        $('#voiceToggleBtn').on('click', function() {
            voiceEnabled = !voiceEnabled;
            localStorage.setItem('agrinova_voice_enabled', voiceEnabled);
            updateVoiceButton();
            showToast('Voice output ' + (voiceEnabled ? 'enabled' : 'disabled') + '.');
            if (!voiceEnabled) {
                $audio[0].pause();
                $audio.attr('src', '');
            }
        });

        // New Chat action in the top header
        $('#headerNewChatBtn').on('click', function() {
            startNewSession();
        });

        $messages.on('click', '.chip', function() { 
            var t = $(this).data('text'); 
            if (t) { 
                $input.val(t); 
                $form.trigger('submit'); 
            } 
        });

        // Robust Event Delegation for Chat History Items, Edit, and Delete Buttons
        $chatHistoryList.on('click', '.chat-history-item', function(e) {
            // Avoid triggering select when clicking action buttons
            if ($(e.target).closest('.chat-item-delete').length || $(e.target).closest('.chat-item-edit').length) return;
            
            var clickedId = $(this).data('id');
            if (clickedId !== activeChatId) {
                activeChatId = clickedId;
                saveChatsToStorage();
                renderSidebarList();
                renderActiveChatMessages();
                
                // Close mobile views
                $sidebar.removeClass('active');
                $('.sidebar-overlay').removeClass('active');
            }
        });

        $chatHistoryList.on('click', '.chat-item-edit', function(e) {
            e.stopPropagation();
            var editId = $(this).data('id');
            renameSession(editId);
        });

        $chatHistoryList.on('click', '.chat-item-delete', function(e) {
            e.stopPropagation();
            var deleteId = $(this).data('id');
            deleteSession(deleteId);
        });

        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
        $input.trigger('focus');
    });

    // ── Custom Confirmation Dialog ──
    function showConfirm(title, message, onConfirm) {
        var $modal = $('#customConfirmModal');
        $modal.find('#confirmTitle').text(title);
        $modal.find('#confirmMessage').text(message);
        $modal.addClass('active');

        // Unbind any previous events to prevent duplicate callbacks
        $modal.find('#confirmOkBtn').off('click').on('click', function() {
            $modal.removeClass('active');
            if (typeof onConfirm === 'function') onConfirm();
        });

        $modal.find('#confirmCancelBtn, .custom-confirm-modal').off('click').on('click', function(e) {
            // Dismiss if clicking cancel button or clicking the dark background overlay directly
            if (e.target === this || $(e.target).attr('id') === 'confirmCancelBtn') {
                $modal.removeClass('active');
            }
        });
    }

    // ── Custom Input/Prompt Dialog ──
    function showInputPrompt(title, message, defaultValue, onSave) {
        var $modal = $('#customInputModal');
        $modal.find('#inputModalTitle').text(title);
        var $field = $modal.find('#customModalInputField');
        $field.val(defaultValue || '');
        $modal.addClass('active');
        
        // Focus and select all text in the field
        setTimeout(function() {
            $field.trigger('focus').select();
        }, 100);

        function handleSave() {
            var val = $field.val();
            $modal.removeClass('active');
            if (typeof onSave === 'function') onSave(val);
        }

        // Unbind any previous events to prevent duplicate callbacks
        $modal.find('#inputModalSaveBtn').off('click').on('click', handleSave);

        // Handle enter key press on input field
        $field.off('keypress').on('keypress', function(e) {
            if (e.which === 13) { // Enter key
                e.preventDefault();
                handleSave();
            }
        });

        $modal.find('#inputModalCancelBtn, .custom-confirm-modal').off('click').on('click', function(e) {
            // Dismiss if clicking cancel button or clicking the dark background overlay directly
            if (e.target === this || $(e.target).attr('id') === 'inputModalCancelBtn') {
                $modal.removeClass('active');
            }
        });
    }

    // ── Theme Management ──
    function initTheme() {
        if (localStorage.getItem('agri-bot-theme') === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            $themeIcon.removeClass('bi-moon-stars-fill').addClass('bi-sun-fill');
        } else {
            document.documentElement.removeAttribute('data-theme');
            $themeIcon.removeClass('bi-sun-fill').addClass('bi-moon-stars-fill');
        }
    }

    function toggleTheme() {
        var isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('agri-bot-theme', 'dark');
            $themeIcon.removeClass('bi-sun-fill').addClass('bi-moon-stars-fill');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('agri-bot-theme', 'light');
            $themeIcon.removeClass('bi-moon-stars-fill').addClass('bi-sun-fill');
        }
    }

    function updateVoiceButton() {
        var $voiceToggleBtn = $('#voiceToggleBtn');
        var $voiceIcon = $('#headerVoiceIcon');
        var $voiceText = $('#headerVoiceText');
        
        if (voiceEnabled) {
            $voiceIcon.removeClass('bi-volume-mute-fill').addClass('bi-volume-up-fill');
            $voiceText.text('Voice: On');
            $voiceToggleBtn.addClass('active');
        } else {
            $voiceIcon.removeClass('bi-volume-up-fill').addClass('bi-volume-mute-fill');
            $voiceText.text('Voice: Off');
            $voiceToggleBtn.removeClass('active');
        }
    }

    // ── Mobile Responsive Sidebar Actions ──
    function initSidebarOverlay() {
        // Create overlay element if not exists
        if (!$('.sidebar-overlay').length) {
            $('<div class="sidebar-overlay"></div>').appendTo('body');
        }
    }

    function initSidebarEvents() {
        $('#menuToggleBtn').on('click', function() {
            $sidebar.addClass('active');
            $('.sidebar-overlay').addClass('active');
        });

        $('#sidebarCloseBtn, .sidebar-overlay').on('click', function() {
            $sidebar.removeClass('active');
            $('.sidebar-overlay').removeClass('active');
        });

        $('#newChatBtn').on('click', function() {
            startNewSession();
            // Close mobile sidebar if open
            $sidebar.removeClass('active');
            $('.sidebar-overlay').removeClass('active');
        });
    }

    // ── Chat Session Engine ──
    function initChatSessions() {
        // Load sessions from localStorage
        var savedChats = localStorage.getItem('agrinova_chats');
        var savedActiveId = localStorage.getItem('agrinova_active_chat_id');

        if (savedChats) {
            try {
                chats = JSON.parse(savedChats);
            } catch (e) {
                chats = [];
            }
        }

        if (chats.length > 0) {
            activeChatId = savedActiveId || chats[0].id;
            // Verify activeChatId actually exists
            var exists = chats.some(function(c) { return c.id === activeChatId; });
            if (!exists) activeChatId = chats[0].id;
        } else {
            // Setup first session
            var newId = generateSessionId();
            var firstChat = {
                id: newId,
                title: 'New Conversation',
                messages: [],
                timestamp: Date.now()
            };
            chats.push(firstChat);
            activeChatId = newId;
            saveChatsToStorage();
        }

        renderSidebarList();
        renderActiveChatMessages();
    }

    function generateSessionId() {
        return 'agrinova_session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function saveChatsToStorage() {
        localStorage.setItem('agrinova_chats', JSON.stringify(chats));
        localStorage.setItem('agrinova_active_chat_id', activeChatId);
    }

    function renderSidebarList() {
        $chatHistoryList.empty();
        
        // Sort chats by timestamp descending
        var sortedChats = [...chats].sort(function(a, b) { return b.timestamp - a.timestamp; });

        sortedChats.forEach(function(chat) {
            var isActive = chat.id === activeChatId ? 'active' : '';
            var itemHtml = '<div class="chat-history-item ' + isActive + '" data-id="' + chat.id + '">'
                + '<div class="chat-item-left">'
                + '<i class="bi bi-chat-left-text"></i>'
                + '<span class="chat-item-title">' + esc(chat.title) + '</span>'
                + '</div>'
                + '<div class="chat-item-actions">'
                + '<button class="chat-item-edit" title="Rename conversation" data-id="' + chat.id + '">'
                + '<i class="bi bi-pencil"></i>'
                + '</button>'
                + '<button class="chat-item-delete" title="Delete conversation" data-id="' + chat.id + '">'
                + '<i class="bi bi-trash"></i>'
                + '</button>'
                + '</div>'
                + '</div>';
            
            $chatHistoryList.append(itemHtml);
        });
    }

    function renameSession(id) {
        var chat = chats.find(function(c) { return c.id === id; });
        if (!chat) return;
        
        showInputPrompt('Rename Conversation', 'Enter new name for this conversation:', chat.title, function(newName) {
            if (newName && newName.trim()) {
                chat.title = newName.trim();
                saveChatsToStorage();
                renderSidebarList();
                showToast('Conversation renamed.');
            }
        });
    }

    function startNewSession() {
        var newId = generateSessionId();
        var newChat = {
            id: newId,
            title: 'New Conversation',
            messages: [],
            timestamp: Date.now()
        };
        chats.unshift(newChat);
        activeChatId = newId;
        saveChatsToStorage();
        renderSidebarList();
        renderActiveChatMessages();
        showToast('Started new conversation.');
        $input.trigger('focus');
    }

    function deleteSession(id) {
        showConfirm('Delete Conversation', 'Are you sure you want to delete this conversation?', function() {
            chats = chats.filter(function(c) { return c.id !== id; });

            if (id === activeChatId) {
                if (chats.length > 0) {
                    activeChatId = chats[0].id;
                } else {
                    var newId = generateSessionId();
                    var freshChat = {
                        id: newId,
                        title: 'New Conversation',
                        messages: [],
                        timestamp: Date.now()
                    };
                    chats.push(freshChat);
                    activeChatId = newId;
                }
            }

            saveChatsToStorage();
            renderSidebarList();
            renderActiveChatMessages();
            showToast('Conversation deleted.');
        });
    }

    function renderActiveChatMessages() {
        $messages.empty();
        var activeChat = chats.find(function(c) { return c.id === activeChatId; });
        
        if (!activeChat || activeChat.messages.length === 0) {
            $messages.html(WELCOME);
            return;
        }

        activeChat.messages.forEach(function(msg) {
            appendMessageToUI(msg.text, msg.type, msg.cache, msg.imageUrl, false, msg.detectedLang);
        });
        scrollBottom();
    }

    // ── Image Handling (5 MB limit) ──
    function handleImageSelect(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { showToast('Image too large. Max 5MB allowed.'); return; }
        if (!file.type.startsWith('image/')) { showToast('Please select an image file.'); return; }
        selectedImage = file;
        var reader = new FileReader();
        reader.onload = function(ev) {
            $previewImg.attr('src', ev.target.result);
            $preview.addClass('active');
        };
        reader.readAsDataURL(file);
        $imageBtn.addClass('active');
    }

    function clearImage() {
        selectedImage = null;
        $imageInput.val('');
        $preview.removeClass('active');
        $previewImg.attr('src', '');
        $imageBtn.removeClass('active');
    }

    function updateLanguageUI() {
        if ($langSelectBtn) {
            $langSelectBtn.val(activeLanguage);
        }
    }

    // ── Render Message to UI ──
    function appendMessageToUI(text, type, cache, imageUrl, shouldAnimate, detectedLang) {
        var isUser = type === 'user';
        var icon = isUser ? 'bi-person-fill' : 'bi-flower2';
        var imgTag = imageUrl ? '<img class="msg-img" src="' + imageUrl + '" alt="Shared image">' : '';

        if (isUser && $messages.find('.welcome').length) {
            $messages.find('.welcome').remove();
        }

        var cacheTag = '';
        if (cache && cache.cached_tokens > 0) {
            cacheTag = '<span class="cache-tag"><i class="bi bi-lightning-fill"></i>' + cache.hit_rate + '% cached</span>';
        }

        var langTag = '';
        if (detectedLang) {
            langTag = '<span class="lang-badge" title="Detected Spoken Language"><i class="bi bi-globe"></i> ' + detectedLang + '</span>';
        }

        var animationClass = shouldAnimate ? 'style="animation: messageFadeIn 0.35s ease both"' : '';

        var html = '<div class="msg ' + type + '" ' + animationClass + '>'
            + '<div class="msg-av"><i class="bi ' + icon + '"></i></div>'
            + '<div class="bubble">'
            + imgTag
            + '<div>' + esc(text).replace(/\n/g, '<br>') + '</div>'
            + '<div class="msg-meta"><span>' + getTime() + '</span>' + cacheTag + langTag + '</div>'
            + '</div></div>';

        $messages.append(html);
        scrollBottom();
    }

    // ── Save message to active state session ──
    function saveMessageToActiveSession(text, type, cache, imageUrl, detectedLang) {
        var activeChat = chats.find(function(c) { return c.id === activeChatId; });
        if (!activeChat) return;

        // Auto generate title if it was first message
        if (activeChat.messages.length === 0 && type === 'user') {
            var summary = text.length > 25 ? text.substring(0, 25) + '...' : text;
            activeChat.title = summary;
        }

        activeChat.messages.push({
            text: text,
            type: type,
            cache: cache || null,
            imageUrl: imageUrl || null,
            detectedLang: detectedLang || null
        });
        activeChat.timestamp = Date.now();
        
        saveChatsToStorage();
        renderSidebarList();
    }

    // ── Send Text or Image ──
    function handleSend(e) {
        e.preventDefault();
        var text = $input.val().trim();
        var hasImage = selectedImage !== null;

        if (!text && !hasImage) return;
        if (isProcessing) return;
        if (!text && hasImage) text = 'What do you see in this image? Please analyze from an agricultural perspective.';

        isProcessing = true;
        $input.val('');
        $sendBtn.prop('disabled', true);
        $voiceBtn.prop('disabled', true);
        $imageBtn.prop('disabled', true);

        var imageToSend = selectedImage;
        var imgPreviewUrl = imageToSend ? $previewImg.attr('src') : null;
        
        // Append & save user message
        appendMessageToUI(text, 'user', null, imgPreviewUrl, true);
        saveMessageToActiveSession(text, 'user', null, imgPreviewUrl);
        
        clearImage();
        showTyping();

        var ajaxHeaders = {
            'X-Session-ID': activeChatId
        };

        if (hasImage) {
            var fd = new FormData();
            fd.append('image', imageToSend, imageToSend.name || 'image.jpg');
            fd.append('text', text);
            fd.append('language', activeLanguage);

            $.ajax({ 
                url: '/chat', 
                type: 'POST', 
                data: fd, 
                contentType: false, 
                processData: false, 
                headers: ajaxHeaders,
                timeout: 180000
            })
            .done(function(r) { 
                hideTyping(); 
                if (r.text) { 
                    appendMessageToUI(r.text, 'bot', r.cache, null, true, r.detected_lang); 
                    saveMessageToActiveSession(r.text, 'bot', r.cache, null, r.detected_lang);
                    playVoice(r.voice); 
                } 
            })
            .fail(function(x) { 
                hideTyping(); 
                var errMsg = getError(x);
                appendMessageToUI(errMsg, 'bot', null, null, true); 
                saveMessageToActiveSession(errMsg, 'bot', null, null);
            })
            .always(done);
        } else {
            $.ajax({ 
                url: '/chat', 
                type: 'POST', 
                data: { text: text, language: activeLanguage }, 
                headers: ajaxHeaders,
                timeout: 60000 
            })
            .done(function(r) { 
                hideTyping(); 
                if (r.text) { 
                    appendMessageToUI(r.text, 'bot', r.cache, null, true, r.detected_lang); 
                    saveMessageToActiveSession(r.text, 'bot', r.cache, null, r.detected_lang);
                    playVoice(r.voice); 
                } 
            })
            .fail(function(x) { 
                hideTyping(); 
                var errMsg = getError(x);
                appendMessageToUI(errMsg, 'bot', null, null, true); 
                saveMessageToActiveSession(errMsg, 'bot', null, null);
            })
            .always(done);
        }

        function done() {
            isProcessing = false;
            $sendBtn.prop('disabled', false);
            $voiceBtn.prop('disabled', false);
            $imageBtn.prop('disabled', false);
            $input.trigger('focus');
        }
    }

    function playVoice(src) {
        if (!src || !voiceEnabled) return;
        $audio.attr('src', src);
        $audio[0].play().catch(function() {});
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('AgriNova AI', { body: 'Voice response ready', icon: '/static/images/favicon.ico' });
        }
    }

    function getError(xhr) {
        if (xhr.status === 400 && xhr.responseJSON) return xhr.responseJSON.error || 'Bad request.';
        if (xhr.status === 429) return 'Too many requests. Please wait.';
        if (xhr.statusText === 'timeout') return 'Request timed out. Try again.';
        return 'Something went wrong. Please try again.';
    }

    // ── Voice Recording ──
    function toggleRecording() { isRecording ? stopRecording() : startRecording(); }
 
    async function startRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showToast('Voice not supported.'); return; }
        try {
            var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            
            // Safe fallback mime types (webm, mp4, ogg, etc.)
            var mimeOptions = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/mp4',
                'audio/aac',
                ''
            ];
            var selectedMime = '';
            for (var i = 0; i < mimeOptions.length; i++) {
                if (mimeOptions[i] === '' || (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mimeOptions[i]))) {
                    selectedMime = mimeOptions[i];
                    break;
                }
            }

            if (selectedMime) {
                mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMime });
            } else {
                mediaRecorder = new MediaRecorder(stream);
            }

            mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = function() { 
                var recorderMime = mediaRecorder.mimeType || 'audio/webm';
                sendAudio(new Blob(audioChunks, { type: recorderMime })); 
                stream.getTracks().forEach(function(t) { t.stop(); }); 
            };
            mediaRecorder.onerror = function() { showToast('Mic error.'); stream.getTracks().forEach(function(t) { t.stop(); }); isRecording = false; $voiceBtn.removeClass('recording'); };
            mediaRecorder.start(250);
            isRecording = true;
            $voiceBtn.addClass('recording');
            showToast('Recording voice...');
        } catch (err) { showToast('Mic access denied.'); }
    }
 
    function stopRecording() { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); isRecording = false; $voiceBtn.removeClass('recording'); }
 
    function sendAudio(blob) {
        if (isProcessing) return;
        isProcessing = true; 
        $sendBtn.prop('disabled', true); 
        $voiceBtn.prop('disabled', true); 
        showTyping();
 
        // Dynamically get correct file extension based on MIME type
        var ext = 'webm';
        if (blob && blob.type) {
            if (blob.type.includes('mp4')) ext = 'mp4';
            else if (blob.type.includes('aac')) ext = 'aac';
            else if (blob.type.includes('ogg')) ext = 'ogg';
            else if (blob.type.includes('wav')) ext = 'wav';
        }

        var fd = new FormData(); 
        fd.append('audio', blob, 'recording.' + ext);
        fd.append('language', activeLanguage);
 
        var ajaxHeaders = {
            'X-Session-ID': activeChatId
        };
 
        $.ajax({ 
            url: '/chat', 
            type: 'POST', 
            data: fd, 
            contentType: false, 
            processData: false, 
            headers: ajaxHeaders,
            timeout: 30000 
        })
        .done(function(r) { 
            hideTyping(); 
            if (r.transcription) {
                var userLangLabel = activeLanguage !== 'auto' ? $('#currentLangText').text().trim().split(' ')[0] : r.detected_lang;
                appendMessageToUI(r.transcription, 'user', null, null, true, userLangLabel); 
                saveMessageToActiveSession(r.transcription, 'user', null, null, userLangLabel);
            }
            if (r.text) { 
                appendMessageToUI(r.text, 'bot', r.cache, null, true, r.detected_lang); 
                saveMessageToActiveSession(r.text, 'bot', r.cache, null, r.detected_lang);
                
                // Automatically turn on voice output if it was toggled off, since user is interacting via voice
                if (!voiceEnabled) {
                    voiceEnabled = true;
                    localStorage.setItem('agrinova_voice_enabled', 'true');
                    updateVoiceButton();
                    showToast('Voice output enabled.');
                }
                playVoice(r.voice); 
            } 
        })
        .fail(function(x) { 
            hideTyping(); 
            appendMessageToUI('Could not process audio query.', 'bot', null, null, true); 
            saveMessageToActiveSession('Could not process audio query.', 'bot', null, null);
        })
        .always(function() { 
            isProcessing = false; 
            $sendBtn.prop('disabled', false); 
            $voiceBtn.prop('disabled', false); 
            $input.trigger('focus'); 
        });
    }

    // ── Clear Conversation ──
    function clearActiveConversation() {
        var activeChat = chats.find(function(c) { return c.id === activeChatId; });
        if (!activeChat || !activeChat.messages || activeChat.messages.length === 0) return;

        showConfirm('Clear Conversation', 'Are you sure you want to clear this active conversation?', function() {
            var ajaxHeaders = {
                'X-Session-ID': activeChatId
            };

            $.ajax({
                url: '/chat/clear',
                type: 'POST',
                headers: ajaxHeaders
            })
            .done(function() {
                activeChat.messages = [];
                activeChat.title = 'New Conversation';
                saveChatsToStorage();
                renderSidebarList();
                renderActiveChatMessages();
                $audio.attr('src', '');
                showToast('Conversation history cleared.');
                $input.trigger('focus');
            });
        });
    }

    // ── Reset All Conversations ──
    function resetAllConversations() {
        showConfirm('Reset All Conversations', 'Are you sure you want to permanently reset all conversations and chat history?', function() {
            // Reset to initial state
            chats = [];
            var newId = generateSessionId();
            var freshChat = {
                id: newId,
                title: 'New Conversation',
                messages: [],
                timestamp: Date.now()
            };
            chats.push(freshChat);
            activeChatId = newId;

            // Perform backend clears for all sessions (safely fire and reset locally)
            $.ajax({
                url: '/chat/clear',
                type: 'POST',
                headers: { 'X-Session-ID': 'ALL' }
            }).always(function() {
                // Local reset is guaranteed
                saveChatsToStorage();
                renderSidebarList();
                renderActiveChatMessages();
                $audio.attr('src', '');
                showToast('All conversations reset.');
                $input.trigger('focus');
            });
        });
    }

    // ── General Helpers ──
    function scrollBottom() { 
        $messages.stop().animate({ scrollTop: $messages[0].scrollHeight }, 200); 
    }
    function getTime() { 
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); 
    }
    function showTyping() { 
        $typing.addClass('visible'); 
        scrollBottom(); 
    }
    function hideTyping() { 
        $typing.removeClass('visible'); 
    }
    function esc(t) { 
        var d = document.createElement('div'); 
        d.textContent = t; 
        return d.innerHTML; 
    }

    // ── Toast notification overlay ──
    function showToast(msg) {
        $('.toast-msg').remove();
        var t = $('<div class="toast-msg"><i class="bi bi-info-circle" style="color:var(--primary); font-size:1.1rem;"></i><span>' + esc(msg) + '</span></div>');
        $('body').append(t); 
        t.fadeIn(200);
        setTimeout(function() { 
            t.fadeOut(200, function() { $(this).remove(); }); 
        }, 3000);
    }

})(jQuery);
