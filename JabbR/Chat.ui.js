﻿/// <reference path="Scripts/jquery-1.7.js" />
/// <reference path="Scripts/jQuery.tmpl.js" />
/// <reference path="Scripts/jquery.cookie.js" />
/// <reference path="Chat.toast.js" />
/// <reference path="Scripts/livestamp.min.js" />
/// <reference path="Scripts/moment.min.js" />

/*jshint bitwise:false */
(function ($, window, document, chat, utility, emoji, linkify) {
    "use strict";

    var $chatArea = null,
        $tabs = null,
        $submitButton = null,
        $newMessage = null,
        $sendMessage = null,
        newMessageLines = 1,
        $roomActions = null,
        $toast = null,
        $disconnectDialog = null,
        $downloadIcon = null,
        $downloadDialog = null,
        $downloadDialogButton = null,
        $downloadRange = null,
        $logout = null,
        $help = null,
        $ui = null,
        $sound = null,
        templates = null,
        focus = true,
        readOnly = false,
        Keys = { Up: 38, Down: 40, Esc: 27, Enter: 13, Backspace: 8, Slash: 47, Space: 32, Tab: 9, Question: 191 },
        scrollTopThreshold = 75,
        toast = window.chat.toast,
        preferences = null,
        $login = null,
        lastCycledMessage = null,
        $helpPopup = null,
        $helpBody = null,
        helpHeight = 0,
        $shortCutHelp = null,
        $globalCmdHelp = null,
        $roomCmdHelp = null,
        $userCmdHelp = null,
        $updatePopup = null,
        $window = $(window),
        $document = $(document),
        $lobbyRoomFilterForm = null,
        lobbyLoaded = false,
        $roomFilterInput = null,
        $closedRoomFilter = null,
        updateTimeout = 15000,
        $richness = null,
        $notify = null,
        $musicServiceDropdown = null,
        lastPrivate = null,
        roomCache = {},
        $reloadMessageNotification = null,
        popoverTimer = null,
        $connectionStatus = null,
        connectionState = -1,
        $connectionStateChangedPopover = null,
        connectionStateIcon = null,
        $connectionInfoPopover = null,
        $connectionInfoContent = null,
        $fileUploadButton = null,
        $hiddenFile = null,
        $uploadForm = null,
        $clipboardUpload = null,
        $clipboardUploadPreview = null,
        $clipboardUploadButton = null,
        $fileRoom = null,
        $fileConnectionId = null,
        connectionInfoStatus = null,
        connectionInfoTransport = null,
        $topicBar = null,
        $loadingHistoryIndicator = null,
        trimRoomHistoryFrequency = 1000 * 60 * 2, // 2 minutes in ms
        $loadMoreRooms = null,
        sortedRoomList = null,
        maxRoomsToLoad = 100,
        lastLoadedRoomIndex = 0,
        $lobbyWrapper = null,
        $lobbyPrivateRooms = null,
        $lobbyOtherRooms = null,
        $roomLoadingIndicator = null,
        roomLoadingDelay = 250,
        roomLoadingTimeout = null,
        Room = chat.Room,
        $unreadNotificationCount = null;

    function getRoomNameFromHash(hash) {
        if (hash.length && hash[0] === '/') {
            hash = hash.substr(1);
        }

        var parts = hash.split('/');
        if (parts[0] === 'rooms') {
            return parts[1];
        }

        return null;
    }

    function getRoomId(roomName) {
        return window.escape(roomName.toString().toLowerCase()).replace(/[^a-z0-9]/, '_');
    }

    function getUserClassName(userName) {
        return '[data-name="' + userName + '"]';
    }

    function getRoomPreferenceKey(roomName) {
        return '_room_' + roomName;
    }

    function setRoomLoading(isLoading, roomName) {
        if (isLoading) {
            var room = getRoomElements(roomName);
            if (!room.isInitialized()) {
                roomLoadingTimeout = window.setTimeout(function () {
                    $roomLoadingIndicator.find('i').addClass('icon-spin');
                    $roomLoadingIndicator.show();
                }, roomLoadingDelay);
            }
        } else {
            if (roomLoadingTimeout) {
                clearTimeout(roomLoadingDelay);
            }
            $roomLoadingIndicator.hide();
            $roomLoadingIndicator.find('i').removeClass('icon-spin');
        }
    }

    function populateLobbyRoomList(item, template, listToPopulate) {
        $.tmpl(template, item).appendTo(listToPopulate);
    }

    function sortRoomList(listToSort) {
        var sortedList = listToSort.sort(function (a, b) {
            if (a.Closed && !b.Closed) {
                return 1;
            } else if (b.Closed && !a.Closed) {
                return -1;
            }

            if (a.Count > b.Count) {
                return -1;
            } else if (b.Count > a.Count) {
                return 1;
            }

            return a.Name.toString().toUpperCase().localeCompare(b.Name.toString().toUpperCase());
        });
        return sortedList;
    }

    function getRoomElements(roomName) {
        var roomId = getRoomId(roomName);
        var room = new Room($('#tabs-' + roomId),
                        $('#userlist-' + roomId),
                        $('#userlist-' + roomId + '-owners'),
                        $('#userlist-' + roomId + '-active'),
                        $('#messages-' + roomId),
                        $('#roomTopic-' + roomId));
        return room;
    }

    function getCurrentRoomElements() {
        var $tab = $tabs.find('li.current');
        var room;
        if ($tab.data('name') === 'Lobby') {
            room = new Room($tab,
                $('#userlist-lobby'),
                $('#userlist-lobby-owners'),
                $('#userlist-lobby-active'),
                $('.messages.current'),
                $('.roomTopic.current'));
        } else {
            room = new Room($tab,
                $('.users.current'),
                $('.userlist.current .owners'),
                $('.userlist.current .active'),
                $('.messages.current'),
                $('.roomTopic.current'));
        }
        return room;
    }

    function getAllRoomElements() {
        var rooms = [];
        $("ul#tabs > li.room").each(function () {
            rooms[rooms.length] = getRoomElements($(this).data("name"));
        });
        return rooms;
    }

    function getLobby() {
        return getRoomElements('Lobby');
    }

    function getRoomsNames() {
        var lobby = getLobby();

        return lobby.users.find('li')
                     .map(function () {
                         var room = $(this).data('name');
                         roomCache[room.toString().toUpperCase()] = true;
                         return room + ' ';
                     });
    }

    function updateLobbyRoomCount(room, count) {
        var lobby = getLobby(),
            $targetList = room.Private === true ? lobby.owners : lobby.users,
            $room = $targetList.find('[data-room="' + room.Name + '"]'),
            $count = $room.find('.count'),
            roomName = room.Name.toString().toUpperCase();

        $room.css('background-color', '#f5f5f5');
        if (count === 0) {
            $count.text('Unoccupied');
        } else if (count === 1) {
            $count.text('1 occupant');
        } else {
            $count.text(count + ' occupants');
        }

        if (room.Private === true) {
            $room.addClass('locked');
        } else {
            $room.removeClass('locked');
        }

        if (room.Closed === true) {
            $room.addClass('closed');
        } else {
            $room.removeClass('closed');
        }

        var nextListElement = getNextRoomListElement($targetList, roomName, count, room.Closed);

        $room.data('count', count);
        if (nextListElement !== null) {
            $room.insertBefore(nextListElement);
        } else {
            $room.appendTo($targetList);
        }

        // Do a little animation
        $room.animate({ backgroundColor: '#ffffff' }, 800);
    }

    function addRoomToLobby(roomViewModel) {
        var lobby = getLobby(),
            $room = templates.lobbyroom.tmpl(roomViewModel),
            roomName = roomViewModel.Name.toString().toUpperCase(),
            count = roomViewModel.Count,
            closed = roomViewModel.Closed,
            $targetList = roomViewModel.Private ? lobby.owners : lobby.users;

        var nextListElement = getNextRoomListElement($targetList, roomName, count, closed);

        if (nextListElement !== null) {
            $room.insertBefore(nextListElement);
        } else {
            $room.appendTo($targetList);
        }

        filterIndividualRoom($room);
    }
    
    function getNextRoomListElement($targetList, roomName, count, closed) {
        var nextListElement = null;

        // move the item to before the next element
        $targetList.find('li').each(function () {
            var $this = $(this),
                liRoomCount = $this.data('count'),
                liRoomClosed = $this.hasClass('closed'),
                nameComparison = $this.data('name').toString().toUpperCase().localeCompare(roomName);

            // skip this element
            if (nameComparison === 0) {
                return true;
            }

            // skip closed rooms which always go after unclosed ones
            if (!liRoomClosed && closed) {
                return true;
            }

            // skip where we have more occupants
            if (liRoomCount > count) {
                return true;
            }

            // skip where we have the same number of occupants but the room is alphabetically earlier
            if (liRoomCount === count && nameComparison < 0) {
                return true;
            }

            nextListElement = $this;
            return false;
        });

        return nextListElement;
    }
    
    function filterIndividualRoom($room) {
        var filter = $roomFilterInput.val().toUpperCase(),
            showClosedRooms = $closedRoomFilter.is(':checked');
        
        if ($room.data('room').toString().toUpperCase().score(filter) > 0.0 && (showClosedRooms || !$room.is('.closed'))) {
            $room.show();
        } else {
            $room.hide();
        }
    }

    function addRoom(roomViewModel) {
        // Do nothing if the room exists
        var roomName = roomViewModel.Name,
            room = getRoomElements(roomViewModel.Name),
            roomId = null,
            viewModel = null,
            $messages = null,
            $roomTopic = null,
            scrollHandler = null,
            userContainer = null;

        if (room.exists()) {
            return false;
        }

        roomId = getRoomId(roomName);

        // Add the tab
        viewModel = {
            id: roomId,
            name: roomName,
            closed: roomViewModel.Closed
        };

        if (!roomCache[roomName.toString().toUpperCase()]) {
            addRoomToLobby(roomViewModel);
        }

        roomCache[roomName.toString().toUpperCase()] = true;

        templates.tab.tmpl(viewModel).data('name', roomName).appendTo($tabs);

        $messages = $('<ul/>').attr('id', 'messages-' + roomId)
                              .addClass('messages')
                              .appendTo($chatArea)
                              .hide();

        $roomTopic = $('<div/>').attr('id', 'roomTopic-' + roomId)
                              .addClass('roomTopic')
                              .appendTo($topicBar)
                              .hide();

        userContainer = $('<div/>').attr('id', 'userlist-' + roomId)
            .addClass('users')
            .appendTo($chatArea).hide();
        templates.userlist.tmpl({ listname: '- Room Owners', id: 'userlist-' + roomId + '-owners' })
            .addClass('owners')
            .appendTo(userContainer);
        templates.userlist.tmpl({ listname: '- Users', id: 'userlist-' + roomId + '-active' })
            .appendTo(userContainer);
        userContainer.find('h3').click(function () {
            if ($.trim($(this).text())[0] === '-') {
                $(this).text($(this).text().replace('-', '+'));
            } else {
                $(this).text($(this).text().replace('+', '-'));
            }
            $(this).next().toggle(0);
            return false;
        });
        
        $tabs.find('li')
            .not('.lobby')
            .sortElements(function (a, b) {
                return $(a).data('name').toString().toUpperCase() > $(b).data('name').toString().toUpperCase() ? 1 : -1;
            });

        scrollHandler = function (ev) {
            var messageId = null;

            // Do nothing if there's nothing else
            if ($(this).data('full') === true) {
                return;
            }

            // If you're we're near the top, raise the event, but if the scroll
            // bar is small enough that we're at the bottom edge, ignore it.
            // We have to use the ui version because the room object above is
            // not fully initialized, so there are no messages.
            if ($(this).scrollTop() <= scrollTopThreshold && !ui.isNearTheEnd(roomId)) {
                var $child = $messages.children('.message:first');
                if ($child.length > 0) {
                    messageId = $child.attr('id')
                                      .substr(2); // Remove the "m-"
                    $ui.trigger(ui.events.scrollRoomTop, [{ name: roomName, messageId: messageId }]);
                }
            }
        };

        // Hookup the scroll handler since event delegation doesn't work with scroll events
        $messages.bind('scroll', scrollHandler);

        // Store the scroll handler so we can remove it later
        $messages.data('scrollHandler', scrollHandler);

        setAccessKeys();

        lobbyLoaded = false;
        return true;
    }

    function removeRoom(roomName) {
        var room = getRoomElements(roomName),
            scrollHandler = null;

        if (room.exists()) {
            // Remove the scroll handler from this room
            scrollHandler = room.messages.data('scrollHandler');
            room.messages.unbind('scrollHandler', scrollHandler);

            room.tab.remove();
            room.messages.remove();
            room.users.remove();
            room.roomTopic.remove();
            setAccessKeys();
        }
    }

    function setAccessKeys() {
        $.each($tabs.find('li.room'), function (index, item) {
            $(item).children('button').attr('accesskey', getRoomAccessKey(index));
        });
    }

    function getRoomAccessKey(index) {
        if (index < 10) {
            return index + 1;
        }
        return 0;
    }

    function navigateToRoom(roomName) {
        var hash = (document.location.hash || '#').substr(1),
            hashRoomName = getRoomNameFromHash(hash);

        if (hashRoomName && hashRoomName === roomName) {
            ui.setActiveRoomCore(roomName);
        }
        else {
            document.location.hash = '#/rooms/' + roomName;
        }
    }

    function processMessage(message, roomName) {
        var isFromCollapibleContentProvider = isFromCollapsibleContentProvider(message.message),
            collapseContent = shouldCollapseContent(message.message, roomName);

        message.trimmedName = utility.trim(message.name, 21);
        message.when = message.date.formatTime(true);
        message.fulldate = message.date.toLocaleString();

        if (collapseContent) {
            message.message = collapseRichContent(message.message);
        }
    }

    function isFromCollapsibleContentProvider(content) {
        return content.indexOf('class="collapsible_box') > -1; // leaving off trailing " purposefully
    }

    function shouldCollapseContent(content, roomName) {
        var collapsible = isFromCollapsibleContentProvider(content),
            collapseForRoom = roomName ? getRoomPreference(roomName, 'blockRichness') : getActiveRoomPreference('blockRichness');

        return collapsible && collapseForRoom;
    }

    function collapseRichContent(content) {
        content = content.replace(/class="collapsible_box/g, 'style="display: none;" class="collapsible_box');
        return content.replace(/class="collapsible_title"/g, 'class="collapsible_title" title="Content collapsed because you have Rich-Content disabled"');
    }
    
    function processRichContent($content) {
        // TODO: A bit of a dirty hack, Maybe this could be done another way?
        var $plexrResult = $("PlexrContentProviderResult", $content);
        
        if ($plexrResult.length == 1) {
            var result = processPlexrContentResult($plexrResult);
            if (result !== null) {
                $("PlexrContentProviderResult", $content).replaceWith(result);
                var curMusicService = getPreference('music_service');
                $('.collapsible_title', $content).text(
                    curMusicService.charAt(0).toUpperCase() + curMusicService.slice(1) +
                    ' (Plexr) (click to show/hide)');
            } else {
                return null;
            }
            return $content;
        } else {
            return $content;
        }
    }

    function processPlexrContentResult($plexrResult) {
        var preferredMusicService = getPreference('music_service');
        var $serviceDetails = $plexrResult.find(preferredMusicService);

        if (preferredMusicService == 'spotify') {
            return "<iframe src=\"https://embed.spotify.com/?uri=" + $serviceDetails.text() + "\" width=\"300\" height=\"380\" " +
                    "frameborder=\"0\" allowtransparency=\"true\"></iframe>";
        } else if (preferredMusicService == 'rdio') {
            return "<iframe width=\"500\" height=\"250\" src=\"https://rd.io/i/" + $serviceDetails.text() + "//?source=oembed\" " +
                    "frameborder=\"0\"></iframe>";
        }
        return null;
    }

    function triggerFocus() {
        if (!utility.isMobile && !readOnly) {
            $newMessage.focus();
        }

        if (focus === false) {
            focus = true;
            $ui.trigger(ui.events.focusit);
        }
    }
    
    function updateNewMessageSize() {
        $sendMessage.height(20 + (20 * newMessageLines));
        $newMessage.height(20 * newMessageLines);
        
        // Update Lobby
        $lobbyWrapper.css('bottom', 30 + (20 * newMessageLines));
        
        // Update Current Room
        var room = getCurrentRoomElements();
        room.messages.css('bottom', 20 + (20 * newMessageLines));
        room.users.css('bottom', 30 + (20 * newMessageLines));
    }
    
    function getNewMessageCursorLine() {
        return $newMessage.val().substr(0, $newMessage[0].selectionStart).split("\n").length;
    }

    function loadPreferences() {
        // Restore the global preferences
    }

    function toggleRichness($element, roomName) {
        var blockRichness = roomName ? getRoomPreference(roomName, 'blockRichness') : preferences.blockRichness;

        if (blockRichness === true) {
            $element.addClass('off');
        }
        else {
            $element.removeClass('off');
        }
    }

    function toggleNotify($element, roomName) {
        var notifyState = getRoomPreference(roomName, 'notify') || 'mentions';

        if (notifyState == 'all' && $element.hasClass('notify-mentions')) {
            $element.removeClass('notify-mentions');
            $element.addClass('notify-all');
            $('.notify-text', $element).text('All');
        } else if (notifyState == 'mentions' && $element.hasClass('notify-all')) {
            $element.removeClass('notify-all');
            $element.addClass('notify-mentions');
            $('.notify-text', $element).text('Mentions');
        }
    }

    function toggleElement($element, preferenceName, roomName) {
        var value = roomName ? getRoomPreference(roomName, preferenceName) : preferences[preferenceName];

        if (value === true) {
            $element.removeClass('off');
        }
        else {
            $element.addClass('off');
        }
    }

    function loadRoomPreferences(roomName) {
        var roomPreferences = getRoomPreference(roomName);

        // Set defaults
        if (getRoomPreference(roomName, 'hasSound') === undefined) {
            setRoomPreference(roomName, 'hasSound', true);
        }

        // Placeholder for room level preferences
        toggleElement($sound, 'hasSound', roomName);
        toggleElement($toast, 'canToast', roomName);
        toggleRichness($richness, roomName);
        toggleNotify($notify, roomName);
    }
    
    function getPreference(name) {
        return preferences[name];
    }

    function setPreference(name, value) {
        preferences[name] = value;

        $(ui).trigger(ui.events.preferencesChanged);
    }

    function setRoomPreference(roomName, name, value) {
        var roomPreferences = preferences[getRoomPreferenceKey(roomName)];

        if (!roomPreferences) {
            roomPreferences = {};
            preferences[getRoomPreferenceKey(roomName)] = roomPreferences;
        }

        roomPreferences[name] = value;

        $ui.trigger(ui.events.preferencesChanged);
    }

    function getRoomPreference(roomName, name) {
        return (preferences[getRoomPreferenceKey(roomName)] || {})[name];
    }

    function getActiveRoomPreference(name) {
        var room = getCurrentRoomElements();
        return getRoomPreference(room.getName(), name);
    }

    function anyRoomPreference(name, value) {
        for (var key in preferences) {
            if (preferences[key][name] === value) {
                return true;
            }
        }
        return false;
    }

    function triggerSend() {
        if (readOnly) {
            return;
        }

        var id = $newMessage.attr('message-id');
        var msg = $.trim($newMessage.val());

        focus = true;

        if (msg) {
            if (msg.toUpperCase() === '/LOGIN') {
                ui.showLogin();
            }
            else {
                if (id === undefined) {
                    $ui.trigger(ui.events.sendMessage, [msg]);
                } else {
                    $ui.trigger(ui.events.sendMessage, [{ content: msg, id: id }]);
                }
            }
        }

        $newMessage.val('');
        newMessageLines = 1;
        updateNewMessageSize();
        $newMessage.removeAttr('message-id');
        $newMessage.removeClass('editing');
        $('#m-' + id).removeClass('editing');
        $newMessage.focus();

        // always scroll to bottom after new message sent
        var room = getCurrentRoomElements();
        room.scrollToBottom();
        room.removeSeparator();
    }

    function updateNote(userViewModel, $user) {
        var $title = $user.find('.name'),
            noteText = userViewModel.note,
            noteTextEncoded = null,
            requireRoomUpdate = false;

        if (userViewModel.noteClass === 'afk') {
            noteText = userViewModel.note + ' (' + userViewModel.timeAgo + ')';
            requireRoomUpdate = ui.setUserInActive($user);
        }
        else if (userViewModel.active) {
            requireRoomUpdate = ui.setUserActive($user);
        }
        else {
            requireRoomUpdate = ui.setUserInActive($user);
        }

        noteTextEncoded = $('<div/>').html(noteText).text();

        // Remove all classes and the text
        $title.removeAttr('title');

        if (userViewModel.note) {
            $title.attr('title', noteTextEncoded);
        }

        if (requireRoomUpdate) {
            $user.each(function () {
                var room = getRoomElements($(this).data('inroom'));
                room.updateUserStatus($(this));
                room.sortLists();
            });
        }
    }

    function updateFlag(userViewModel, $user) {
        var $flag = $user.find('.flag');

        $flag.removeAttr('class');
        $flag.addClass('flag');
        $flag.removeAttr('title');

        if (userViewModel.flagClass) {
            $flag.addClass(userViewModel.flagClass);
            $flag.show();
        } else {
            $flag.hide();
        }

        if (userViewModel.country) {
            $flag.attr('title', userViewModel.country);
        }
    }

    function updateRoomTopic(roomViewModel) {
        var room = getRoomElements(roomViewModel.Name);
        var topic = roomViewModel.Topic;
        var topicHtml = topic === '' ? 'You\'re chatting in ' + roomViewModel.Name : ui.processContent(topic);
        var roomTopic = room.roomTopic;
        var isVisibleRoom = getCurrentRoomElements().getName() === roomViewModel.Name;

        if (isVisibleRoom) {
            roomTopic.hide();
        }

        roomTopic.html(topicHtml);

        if (isVisibleRoom) {
            roomTopic.fadeIn(2000);
        }
    }

    function getConnectionStateChangedPopoverOptions(statusText) {
        var options = {
            html: true,
            trigger: 'hover',
            template: $connectionStateChangedPopover,
            content: function () {
                return statusText;
            }
        };
        return options;
    }

    function getConnectionInfoPopoverOptions(transport) {
        var options = {
            html: true,
            trigger: 'hover',
            delay: {
                show: 0,
                hide: 500
            },
            template: $connectionInfoPopover,
            content: function () {
                var connectionInfo = $connectionInfoContent;
                connectionInfo.find(connectionInfoStatus).text('Status: Connected');
                connectionInfo.find(connectionInfoTransport).text('Transport: ' + transport);
                return connectionInfo.html();
            }
        };
        return options;
    }

    function loadMoreLobbyRooms() {
        var lobby = getLobby(),
            moreRooms = sortedRoomList.slice(lastLoadedRoomIndex, lastLoadedRoomIndex + maxRoomsToLoad);

        populateLobbyRoomList(moreRooms, templates.lobbyroom, lobby.users);
        lastLoadedRoomIndex = lastLoadedRoomIndex + maxRoomsToLoad;
        
        // re-filter lists
        $lobbyRoomFilterForm.submit();
    }

    var ui = {

        //lets store any events to be triggered as constants here to aid intellisense and avoid
        //string duplication everywhere
        events: {
            closeRoom: 'jabbr.ui.closeRoom',
            prevMessage: 'jabbr.ui.prevMessage',
            openRoom: 'jabbr.ui.openRoom',
            nextMessage: 'jabbr.ui.nextMessage',
            activeRoomChanged: 'jabbr.ui.activeRoomChanged',
            scrollRoomTop: 'jabbr.ui.scrollRoomTop',
            typing: 'jabbr.ui.typing',
            sendMessage: 'jabbr.ui.sendMessage',
            focusit: 'jabbr.ui.focusit',
            blurit: 'jabbr.ui.blurit',
            preferencesChanged: 'jabbr.ui.preferencesChanged',
            loggedOut: 'jabbr.ui.loggedOut',
            reloadMessages: 'jabbr.ui.reloadMessages',
            fileUploaded: 'jabbr.ui.fileUploaded',
            setMessageId: 'jabber.ui.setMessageId'
        },

        help: {
            shortcut: 'shortcut',
            global: 'global',
            room: 'room',
            user: 'user'
        },

        initialize: function (state) {
            $ui = $(this);
            preferences = state || {};
            $chatArea = $('#chat-area');
            $tabs = $('#tabs');
            $submitButton = $('#send');
            $newMessage = $('#new-message');
            $sendMessage = $('#send-message');
            $roomActions = $('#room-actions');
            $toast = $('#room-preferences .toast');
            $sound = $('#room-preferences .sound');
            $richness = $('#room-preferences .richness');
            $notify = $('#room-actions .notify');
            $musicServiceDropdown = $('#music-service-dropdown');
            $downloadIcon = $('#room-preferences .download');
            $downloadDialog = $('#download-dialog');
            $downloadDialogButton = $('#download-dialog-button');
            $downloadRange = $('#download-range');
            $logout = $('#preferences .logout');
            $help = $('#preferences .help');
            $disconnectDialog = $('#disconnect-dialog');
            $login = $('#jabbr-login');
            $helpPopup = $('#jabbr-help');
            $clipboardUpload = $('#jabbr-clipboard-upload');
            $clipboardUploadPreview = $('#jabbr-clipboard-upload #clipboard-upload-preview');
            $clipboardUploadButton = $('#jabbr-clipboard-upload #clipboard-upload');
            $helpBody = $('#jabbr-help .help-body');
            $shortCutHelp = $('#jabbr-help #shortcut');
            $globalCmdHelp = $('#jabbr-help #global');
            $roomCmdHelp = $('#jabbr-help #room');
            $userCmdHelp = $('#jabbr-help #user');
            $updatePopup = $('#jabbr-update');
            focus = true;
            $lobbyRoomFilterForm = $('#room-filter-form'),
            $roomFilterInput = $('#room-filter'),
            $closedRoomFilter = $('#room-filter-closed');
            templates = {
                userlist: $('#new-userlist-template'),
                user: $('#new-user-template'),
                message: $('#new-message-template'),
                notification: $('#new-notification-template'),
                separator: $('#message-separator-template'),
                tab: $('#new-tab-template'),
                gravatarprofile: $('#gravatar-profile-template'),
                commandhelp: $('#command-help-template'),
                multiline: $('#multiline-content-template'),
                lobbyroom: $('#new-lobby-room-template'),
                otherlobbyroom: $('#new-other-lobby-room-template')
            };
            $reloadMessageNotification = $('#reloadMessageNotification');
            $fileUploadButton = $('.upload-button');
            $hiddenFile = $('#hidden-file');
            $uploadForm = $('#upload');
            $fileRoom = $('#file-room');
            $fileConnectionId = $('#file-connection-id');
            $connectionStatus = $('#connectionStatus');

            $connectionStateChangedPopover = $('#connection-state-changed-popover');
            connectionStateIcon = '#popover-content-icon';
            $connectionInfoPopover = $('#connection-info-popover');
            $connectionInfoContent = $('#connection-info-content');
            connectionInfoStatus = '#connection-status';
            connectionInfoTransport = '#connection-transport';
            $topicBar = $('#topic-bar');
            $loadingHistoryIndicator = $('#loadingRoomHistory');

            $loadMoreRooms = $('#load-more-rooms-item');
            $lobbyWrapper = $('#lobby-wrapper');
            $lobbyPrivateRooms = $('#lobby-private');
            $lobbyOtherRooms = $('#lobby-other');
            $roomLoadingIndicator = $('#room-loading');

            $unreadNotificationCount = $('#notification-unread-count');

            if (toast.canToast()) {
                $toast.show();
            }
            else {
                $richness.css({ left: '55px' });
                $downloadIcon.css({ left: '90px' });
                // We need to set the toast setting to false
                preferences.canToast = false;
                $toast.hide();
            }
            
            // Music Service (PlexrContentProvider)
            if (getPreference('music_service') === undefined) {
                setPreference('music_service', "spotify");
            }
            $('li.' + getPreference('music_service'), $musicServiceDropdown).addClass('active');

            // DOM events
            $document.on('click', 'h3.collapsible_title', function () {
                var nearEnd = ui.isNearTheEnd();

                $(this).next().toggle(0, function () {
                    if (nearEnd) {
                        ui.scrollToBottom();
                    }
                });
            });

            $document.on('click', '#tabs li', function () {
                ui.setActiveRoom($(this).data('name'));
            });

            $document.on('click', 'li.room .room-row', function () {
                var roomName = $(this).parent().data('name'),
                    room = getRoomElements(roomName);

                if (room.exists()) {
                    ui.setActiveRoom(roomName);
                }
                else {
                    $ui.trigger(ui.events.openRoom, [roomName]);
                }
            });

            $document.on('click', '#load-more-rooms-item', function () {
                var spinner = $loadMoreRooms.find('i'),
                    lobby = getLobby();
                spinner.addClass('icon-spin');
                spinner.show();
                var loader = $loadMoreRooms.find('.load-more-rooms a');
                loader.html(' Loading more rooms...');
                loadMoreLobbyRooms();
                spinner.hide();
                spinner.removeClass('icon-spin');
                loader.html('Load More...');
                if (lastLoadedRoomIndex < sortedRoomList.length) {
                    $loadMoreRooms.show();
                } else {
                    $loadMoreRooms.hide();
                }
            });

            $document.on('click', '#tabs li .close', function (ev) {
                var roomName = $(this).closest('li').data('name');

                $ui.trigger(ui.events.closeRoom, [roomName]);

                ev.preventDefault();
                return false;
            });

            // handle click on notifications
            $document.on('click', '.notification a.info', function (ev) {
                var $notification = $(this).closest('.notification');

                if ($(this).hasClass('collapse')) {
                    ui.collapseNotifications($notification);
                }
                else {
                    ui.expandNotifications($notification);
                }
            });

            $document.on('click', '#reloadMessageNotification a', function () {
                $ui.trigger(ui.events.reloadMessages);
            });

            // handle tab cycling - we skip the lobby when cycling
            // handle shift+/ - display help command
            $document.on('keydown', function (ev) {
                if (ev.keyCode === Keys.Tab && $newMessage.val() === "") {
                    var current = getCurrentRoomElements(),
                        index = current.tab.index(),
                        tabCount = $tabs.children().length - 1;

                    if (!ev.shiftKey) {
                        // Next tab
                        index = index % tabCount + 1;
                    } else {
                        // Prev tab
                        index = (index - 1) || tabCount;
                    }

                    ui.setActiveRoom($tabs.children().eq(index).data('name'));
                    if (!readOnly) {
                        $newMessage.focus();
                    }
                }

                if (!$newMessage.is(':focus') && ev.shiftKey && ev.keyCode === Keys.Question) {
                    ui.showHelp();
                    // Prevent the ? be recorded in the message box
                    ev.preventDefault();
                }
            });

            // hack to get Chrome to scroll back to top of help body
            // when redisplaying it after scrolling down and closing it
            $helpPopup.on('hide', function () {
                $helpBody.scrollTop(0);
            });

            // set the height of the help body when displaying the help dialog
            // so that the scroll bar does not block the rounded corners
            $helpPopup.on('show', function () {
                if (helpHeight === 0) {
                    helpHeight = $helpPopup.height() - $helpBody.position().top - 10;
                }
                $helpBody.css('height', helpHeight);
            });

            // handle click on names in chat / room list
            var prepareMessage = function (ev) {
                if (readOnly) {
                    return false;
                }

                var message = $newMessage.val().trim();

                // If it was a message to another person, replace that
                if (message.indexOf('/msg') === 0) {
                    message = message.replace(/^\/msg \S+/, '');
                }

                // Re-focus because we lost it on the click
                $newMessage.focus();

                // Do not convert this to a message if it is a command
                if (message[0] === '/') {
                    return false;
                }

                // Prepend our target username
                message = '@' + $(this).text().trim() + ' ' + message;
                ui.setMessage({ content: message });
                return false;
            };
            $document.on('click', '.users li.user .name', prepareMessage);
            $document.on('click', '.message .left .name', prepareMessage);

            $submitButton.click(function (ev) {
                triggerSend();

                ev.preventDefault();
                return false;
            });

            $sound.click(function () {
                var room = getCurrentRoomElements();

                if (room.isLobby()) {
                    return;
                }

                $(this).toggleClass('off');

                var enabled = !$(this).hasClass('off');

                // Store the preference
                setRoomPreference(room.getName(), 'hasSound', enabled);
            });

            $richness.click(function () {
                var room = getCurrentRoomElements(),
                    $richContentMessages = room.messages.find('h3.collapsible_title');

                if (room.isLobby()) {
                    return;
                }

                $(this).toggleClass('off');

                var enabled = !$(this).hasClass('off');

                // Store the preference
                setRoomPreference(room.getName(), 'blockRichness', !enabled);

                // toggle all rich-content for current room
                $richContentMessages.each(function (index) {
                    var $this = $(this),
                        isCurrentlyVisible = $this.next().is(":visible");

                    if (enabled) {
                        $this.attr('title', 'Content collapsed because you have Rich-Content disabled');
                    } else {
                        $this.removeAttr('title');
                    }

                    if (isCurrentlyVisible ^ enabled) {
                        $this.trigger('click');
                    }
                });
            });

            $notify.click(function (e) {
                e.preventDefault();

                var room = getCurrentRoomElements(),
                    $richContentMessages = room.messages.find('h3.collapsible_title');

                if (room.isLobby()) {
                    return;
                }

                if ($(this).hasClass("notify-all")) {
                    $(this).removeClass('notify-all');
                    $(this).addClass('notify-mentions');
                    $(".notify-text", this).text('Mentions');
                } else if($(this).hasClass("notify-mentions")) {
                    $(this).removeClass('notify-mentions');
                    $(this).addClass('notify-all');
                    $(".notify-text", this).text('All');
                }

                if ($(this).hasClass("notify-all")) {
                    setRoomPreference(room.getName(), 'notify', 'all');
                } else if ($(this).hasClass("notify-mentions")) {
                    setRoomPreference(room.getName(), 'notify', 'mentions');
                }
            });

            $('li a', $musicServiceDropdown).click(function (e) {
                var li = $(this).parent();
                
                // TODO: This is pretty dirty, Rewrite later.
                if (li.hasClass('spotify')) {
                    if (getPreference('music_service') != 'spotify') {
                        setPreference('music_service', 'spotify');
                        $('li.rdio', $musicServiceDropdown).removeClass('active');
                        $('li.spotify', $musicServiceDropdown).addClass('active');
                    }
                } else if (li.hasClass('rdio')) {
                    if (getPreference('music_service') != 'rdio') {
                        setPreference('music_service', 'rdio');
                        $('li.rdio', $musicServiceDropdown).addClass('active');
                        $('li.spotify', $musicServiceDropdown).removeClass('active');
                    }
                }
            });

            $toast.click(function () {
                var $this = $(this),
                    enabled = !$this.hasClass('off'),
                    room = getCurrentRoomElements();

                if (room.isLobby()) {
                    return;
                }

                if (enabled) {
                    // If it's enabled toggle the preference
                    setRoomPreference(room.getName(), 'canToast', !enabled);
                    $this.toggleClass('off');
                }
                else {
                    toast.enableToast()
                    .done(function () {
                        setRoomPreference(room.getName(), 'canToast', true);
                        $this.removeClass('off');
                    })
                    .fail(function () {
                        setRoomPreference(room.getName(), 'canToast', false);
                        $this.addClass('off');
                    });
                }
            });

            $(toast).bind('toast.focus', function (ev, room) {
                window.focus();
            });

            $downloadIcon.click(function () {
                var room = getCurrentRoomElements();

                if (room.isLobby()) {
                    return; //Show a message?
                }

                if (room.isLocked()) {
                    return; //Show a message?
                }

                $downloadDialog.modal({ backdrop: true, keyboard: true });
            });

            $downloadDialogButton.click(function () {
                var room = getCurrentRoomElements();

                var url = document.location.href;
                var nav = url.indexOf('#');
                url = nav > 0 ? url.substring(0, nav) : url;
                url = url.replace('default.aspx', '');
                url += 'api/v1/messages/' +
                       encodeURI(room.getName()) +
                       '?download=true&range=' +
                       encodeURIComponent($downloadRange.val());

                $('<iframe style="display:none">').attr('src', url).appendTo(document.body);

                $downloadDialog.modal('hide');
            });

            $logout.click(function () {
                $ui.trigger(ui.events.loggedOut);
            });

            $help.click(function () {
                ui.showHelp();
            });
            
            $roomFilterInput.bind('input', function () { $lobbyRoomFilterForm.submit(); })
                .keyup(function () { $lobbyRoomFilterForm.submit(); });

            $closedRoomFilter.click(function() { $lobbyRoomFilterForm.submit(); });

            $lobbyRoomFilterForm.submit(function () {
                var room = getCurrentRoomElements(),
                    $lobbyRoomsLists = $lobbyPrivateRooms.add($lobbyOtherRooms);

                // bounce on any room other than lobby
                if (!room.isLobby()) {
                    return false;
                }

                // hide all elements except those that match the input / closed filters
                $lobbyRoomsLists
                    .find('li:not(.empty)')
                    .each(function () { filterIndividualRoom($(this)); });
                
                $lobbyRoomsLists.find('ul').each(function () {
                    room.setListState($(this));
                });
                return false;
            });

            $window.blur(function () {
                focus = false;
                $ui.trigger(ui.events.blurit);
            });

            $window.focus(function () {
                // clear unread count in active room
                var room = getCurrentRoomElements();
                room.makeActive();

                if (!focus) {
                    triggerFocus();
                }
            });

            $window.resize(function () {
                var room = getCurrentRoomElements();
                room.scrollToBottom();
            });

            $newMessage.keydown(function (ev) {
                var key = ev.keyCode || ev.which;
                switch (key) {
                    case Keys.Up:
                        if (getNewMessageCursorLine() == 1 && cycleMessage(ui.events.prevMessage)) {
                            ev.preventDefault();
                        }
                        break;
                    case Keys.Down:
                        if (getNewMessageCursorLine() == newMessageLines && cycleMessage(ui.events.nextMessage)) {
                            ev.preventDefault();
                        }
                        break;
                    case Keys.Esc:
                        $(this).val('');
                        newMessageLines = 1;
                        updateNewMessageSize();
                        if ($(this).attr('message-id') !== undefined) {
                            $('#m-' + $(this).attr('message-id')).removeClass('editing');
                            $(this).removeAttr('message-id');
                        }
                        $(this).removeClass('editing');
                        break;
                    case Keys.Backspace:
                        setTimeout(function() {
                            newMessageLines = $newMessage.val().split('\n').length;
                            updateNewMessageSize();
                        }, 100);
                        break;
                    case Keys.Space:
                        // Check for "/r " to reply to last private message
                        if ($(this).val() === "/r" && lastPrivate) {
                            ui.setMessage("/msg " + lastPrivate);
                        }
                        break;
                }
            });

            // Returns true if a cycle was triggered
            function cycleMessage(messageHistoryDirection) {
                var currentMessage = $newMessage.attr('message-id');
                if (currentMessage === undefined || lastCycledMessage === currentMessage) {
                    $ui.trigger(messageHistoryDirection);
                    return true;
                }
                return false;
            }

            // Auto-complete for user names
            $newMessage.autoTabComplete({
                prefixMatch: '[@#/:]',
                get: function (prefix) {
                    switch (prefix) {
                        case '@':
                            var room = getCurrentRoomElements();
                            // exclude current username from autocomplete
                            return room.users.find('li[data-name != "' + ui.getUserName() + '"]')
                                         .not('.room')
                                         .map(function () { return ($(this).data('name') + ' ' || "").toString(); });
                        case '#':
                            return getRoomsNames();

                        case '/':
                            return ui.getCommands()
                                         .map(function (cmd) { return cmd.Name + ' '; });

                        case ':':
                            return emoji.getIcons();
                        default:
                            return [];
                    }
                }
            });

            $newMessage.keypress(function (ev) {
                var key = ev.keyCode || ev.which;
                
                switch (key) {
                    case Keys.Up:
                    case Keys.Down:
                    case Keys.Esc:
                        break;
                    case Keys.Enter:
                        if (ev.shiftKey) {
                            newMessageLines += 1;
                            updateNewMessageSize();
                            $ui.trigger(ui.events.typing);
                        } else {
                            triggerSend();
                            ev.preventDefault();
                        }
                        break;
                    default:
                        if ($newMessage.val()[0] === '/' || key === Keys.Slash) {
                            return;
                        }
                        $ui.trigger(ui.events.typing);
                        break;
                }
            });

            $newMessage.bind('paste', function () {
                setTimeout(function() {
                    newMessageLines = $newMessage.val().split('\n').length;
                    updateNewMessageSize();
                }, 100);
            });

            if (!readOnly) {
                $newMessage.focus();
            }

            // Make sure we can toast at all
            toast.ensureToast(preferences);

            // Load preferences
            loadPreferences();

            // Crazy browser hack
            $hiddenFile[0].style.left = '-800px';

            $clipboardUploadButton.on("click", function () {
                var name = "clipboard-data",
                    uploader = {
                        submitFile: function (connectionId, room) {
                            $fileConnectionId.val(connectionId);

                            $fileRoom.val(room);

                            //$uploadForm.submit();
                            $.ajax({
                                url: '/upload-clipboard',
                                dataType: 'json',
                                type: 'POST',
                                data: {
                                    file: $clipboardUploadPreview.attr("src"),
                                    room: room,
                                    connectionId: connectionId
                                }
                            }).done(function (result) {
                                //remove image from preview
                                $clipboardUploadPreview.attr("src", "");
                            });

                            $hiddenFile.val(''); //hide upload dialog
                        }
                    };

                ui.addMessage('Uploading \'' + name + '\'.', 'broadcast');

                $ui.trigger(ui.events.fileUploaded, [uploader]);
                $clipboardUpload.modal('hide');
            });

            $hiddenFile.change(function () {
                if (!$hiddenFile.val()) {
                    return;
                }

                var path = $hiddenFile.val(),
                    slash = path.lastIndexOf('\\'),
                    name = path.substring(slash + 1),
                    uploader = {
                        submitFile: function (connectionId, room) {
                            $fileConnectionId.val(connectionId);

                            $fileRoom.val(room);

                            $uploadForm.submit();

                            $hiddenFile.val('');
                        }
                    };

                ui.addMessage('Uploading \'' + name + '\'.', 'broadcast');

                $ui.trigger(ui.events.fileUploaded, [uploader]);
            });

            // Configure livestamp to only update every 30s since display granularity is by minute anyway (saves CPU cycles)
            $.livestamp.interval(30 * 1000);

            setInterval(function () {
                ui.trimRoomMessageHistory();
            }, trimRoomHistoryFrequency);
        },
        run: function () {
            $.history.init(function (hash) {
                var roomName = getRoomNameFromHash(hash);

                if (roomName) {
                    if (ui.setActiveRoomCore(roomName) === false && roomName !== 'Lobby') {
                        $ui.trigger(ui.events.openRoom, [roomName]);
                    }
                }
            });
        },
        setMessage: function (clientMessage) {
            $newMessage.val(clientMessage.content);
            $newMessage.attr('message-id', clientMessage.id);
            
            newMessageLines = clientMessage.content.split('\n').length;
            updateNewMessageSize();
            
            $newMessage.addClass('editing');

            if (lastCycledMessage !== null) {
                $('#m-' + lastCycledMessage).removeClass('editing');
            }
            $('#m-' + clientMessage.id).addClass('editing');
            $('#m-' + clientMessage.id)[0].scrollIntoView();

            lastCycledMessage = clientMessage.id;

            if (clientMessage.content) {
                $newMessage.selectionEnd = clientMessage.content.length;
            }
        },
        addRoom: addRoom,
        removeRoom: removeRoom,
        setRoomOwner: function (ownerName, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUser(ownerName);
            $user
                .attr('data-owner', true)
                .data('owner', true);
            room.updateUserStatus($user);
        },
        clearRoomOwner: function (ownerName, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUser(ownerName);
            $user
                 .removeAttr('data-owner')
                 .data('owner', false);
            room.updateUserStatus($user);
        },
        setActiveRoom: navigateToRoom,
        setActiveRoomCore: function (roomName) {
            var room = getRoomElements(roomName);

            loadRoomPreferences(roomName);

            if (room.isActive()) {
                // Still trigger the event (just do less overall work)
                $ui.trigger(ui.events.activeRoomChanged, [roomName]);
                return true;
            }

            var currentRoom = getCurrentRoomElements();

            if (room.exists()) {
                if (currentRoom.exists()) {
                    currentRoom.makeInactive();
                    if (currentRoom.isLobby()) {
                        $lobbyRoomFilterForm.hide();
                        $roomActions.show();
                    }
                }

                triggerFocus();
                room.makeActive();

                if (room.isLobby()) {
                    $roomActions.hide();
                    $lobbyRoomFilterForm.show();

                    room.messages.hide();
                }

                ui.toggleMessageSection(room.isClosed());

                $ui.trigger(ui.events.activeRoomChanged, [roomName]);
                return true;
            }

            return false;
        },
        setRoomLocked: function (roomName) {
            var room = getRoomElements(roomName);

            room.setLocked();
        },
        setRoomClosed: function (roomName) {
            var room = getRoomElements(roomName);

            room.close();
        },
        updateLobbyRoomCount: updateLobbyRoomCount,
        updatePrivateLobbyRooms: function (roomName) {
            var lobby = getLobby(),
                $room = lobby.users.find('li[data-name="' + roomName + '"]');

            $room.addClass('locked').appendTo(lobby.owners);
        },
        updateUnread: function (roomName, isMentioned) {
            var room = roomName ? getRoomElements(roomName) : getCurrentRoomElements();

            if (ui.hasFocus() && room.isActive()) {
                return;
            }

            room.updateUnread(isMentioned);
        },
        scrollToBottom: function (roomName) {
            var room = roomName ? getRoomElements(roomName) : getCurrentRoomElements();

            if (room.isActive()) {
                room.scrollToBottom();
            }
        },
        watchMessageScroll: function (messageIds, roomName) {
            // Given an array of message ids, if there is any embedded content
            // in it, it may cause the window to scroll off of the bottom, so we
            // can watch for that and correct it.
            messageIds = $.map(messageIds, function (id) { return '#m-' + id; });

            var $messages = $(messageIds.join(',')),
                $content = $messages.expandableContent(),
                room = getRoomElements(roomName),
                nearTheEndBefore = room.messages.isNearTheEnd(),
                scrollTopBefore = room.messages.scrollTop();

            if (nearTheEndBefore && $content.length > 0) {
                // Note that the load event does not bubble, so .on() is not
                // suitable here.
                $content.load(function (event) {
                    // If we used to be at the end and our scrollTop() did not
                    // change, then we can safely call scrollToBottom() without
                    // worrying about interrupting the user. We skip this if the
                    // room is already at the end in the event of multiple
                    // images loading at the same time.
                    if (!room.messages.isNearTheEnd() && scrollTopBefore === room.messages.scrollTop()) {
                        room.scrollToBottom();
                        // Reset our scrollTopBefore so we know we are allowed
                        // to move it again if another image loads and the user
                        // hasn't touched it
                        scrollTopBefore = room.messages.scrollTop();
                    }

                    // unbind the event from this object after it executes
                    $(this).unbind(event);
                });
            }
        },
        isNearTheEnd: function (roomName) {
            var room = roomName ? getRoomElements(roomName) : getCurrentRoomElements();

            return room.isNearTheEnd();
        },
        setRoomLoading: setRoomLoading,
        populateLobbyRooms: function (rooms, privateRooms) {
            var lobby = getLobby(),
                i;
            if (!lobby.isInitialized()) {

                // Populate the room cache
                for (i = 0; i < rooms.length; ++i) {
                    roomCache[rooms[i].Name.toString().toUpperCase()] = true;
                }

                for (i = 0; i < privateRooms.length; ++i) {
                    roomCache[privateRooms[i].Name.toString().toUpperCase()] = true;
                }

                // sort private lobby rooms
                var privateSorted = sortRoomList(privateRooms);
                
                // sort other lobby rooms but filter out private rooms
                sortedRoomList = sortRoomList(rooms).filter(function (room) {
                    return !privateSorted.some(function (allowed) {
                        return allowed.Name === room.Name;
                    });
                });

                lobby.owners.empty();
                lobby.users.empty();

                var listOfPrivateRooms = $('<ul/>');
                if (privateSorted.length > 0) {
                    populateLobbyRoomList(privateSorted, templates.lobbyroom, listOfPrivateRooms);
                    listOfPrivateRooms.children('li').appendTo(lobby.owners);
                    $lobbyPrivateRooms.show();
                    $lobbyOtherRooms.find('nav-header').html('Other Rooms');
                } else {
                    $lobbyPrivateRooms.hide();
                    $lobbyOtherRooms.find('nav-header').html('Rooms');
                }

                var listOfRooms = $('<ul/>');
                populateLobbyRoomList(sortedRoomList.splice(0, maxRoomsToLoad), templates.lobbyroom, listOfRooms);
                lastLoadedRoomIndex = listOfRooms.children('li').length;
                listOfRooms.children('li').appendTo(lobby.users);
                if (lastLoadedRoomIndex < sortedRoomList.length) {
                    $loadMoreRooms.show();
                }
                $lobbyOtherRooms.show();
            }

            if (lobby.isActive()) {
                // update cache of room names
                $lobbyRoomFilterForm.show();
            }

            // re-filter lists
            $lobbyRoomFilterForm.submit();
        },
        addUser: function (userViewModel, roomName) {
            var room = getRoomElements(roomName),
                $user = null;

            // Remove all users that are being removed
            room.users.find('.removing').remove();

            // Get the user element
            $user = room.getUser(userViewModel.name);

            if ($user.length) {
                return false;
            }

            $user = templates.user.tmpl(userViewModel);
            $user.data('inroom', roomName);
            $user.data('owner', userViewModel.owner);
            $user.data('admin', userViewModel.admin);

            room.addUser(userViewModel, $user);
            updateNote(userViewModel, $user);
            updateFlag(userViewModel, $user);

            return true;
        },
        setUserActivity: function (userViewModel) {
            var $user = $('.users').find(getUserClassName(userViewModel.name)),
                active = $user.data('active'),
                $idleSince = $user.find('.idle-since');

            if (userViewModel.active === true) {
                if ($user.hasClass('idle')) {
                    $user.removeClass('idle');
                    $idleSince.livestamp('destroy');
                }
            } else {
                if (!$user.hasClass('idle')) {
                    $user.addClass('idle');
                }

                if (!$idleSince.html()) {
                    $idleSince.livestamp(userViewModel.lastActive);
                }
            }

            updateNote(userViewModel, $user);
        },
        setUserActive: function ($user) {
            var $idleSince = $user.find('.idle-since');
            if ($user.data('active') === true) {
                return false;
            }
            $user.attr('data-active', true);
            $user.data('active', true);
            $user.removeClass('idle');
            if ($idleSince.livestamp('isLiveStamp')) {
                $idleSince.livestamp('destroy');
            }
            return true;
        },
        setUserInActive: function ($user) {
            if ($user.data('active') === false) {
                return false;
            }
            $user.attr('data-active', false);
            $user.data('active', false);
            $user.addClass('idle');
            return true;
        },
        changeUserName: function (oldName, user, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUserReferences(oldName);

            // Update the user's name
            $user.find('.name').fadeOut('normal', function () {
                $(this).html(user.Name);
                $(this).fadeIn('normal');
            });
            $user.data('name', user.Name);
            $user.attr('data-name', user.Name);
            room.sortLists();
        },
        changeGravatar: function (user, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUserReferences(user.Name),
                src = 'https://secure.gravatar.com/avatar/' + user.Hash + '?s=16&d=mm';

            $user.find('.gravatar')
                 .attr('src', src);
        },
        showGravatarProfile: function (profile) {
            var room = getCurrentRoomElements(),
                nearEnd = ui.isNearTheEnd();

            this.appendMessage(templates.gravatarprofile.tmpl(profile), room);
            if (nearEnd) {
                ui.scrollToBottom();
            }
        },
        removeUser: function (user, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUser(user.Name);

            $user.addClass('removing')
                .fadeOut('slow', function () {
                    var owner = $user.data('owner') || false;
                    $(this).remove();

                    if (owner === true) {
                        room.setListState(room.owners);
                    } else {
                        room.setListState(room.activeUsers);
                    }
                });
        },
        setUserTyping: function (userViewModel, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUser(userViewModel.name),
                timeout = null;

            // if the user is somehow missing from room, add them
            if ($user.length === 0) {
                ui.addUser(userViewModel, roomName);
            }

            // Do not show typing indicator for current user
            if (userViewModel.name === ui.getUserName()) {
                return;
            }

            // Mark the user as typing
            $user.addClass('typing');
            var oldTimeout = $user.data('typing');

            if (oldTimeout) {
                clearTimeout(oldTimeout);
            }

            timeout = window.setTimeout(function () {
                $user.removeClass('typing');
            },
            3000);

            $user.data('typing', timeout);
        },
        setLoadingHistory: function (loadingHistory) {
            if (loadingHistory) {
                var room = getCurrentRoomElements();
                $loadingHistoryIndicator.appendTo(room.messages);
                $loadingHistoryIndicator.fadeIn('slow');
            } else {
                $loadingHistoryIndicator.hide();
            }
        },
        setRoomTrimmable: function (roomName, canTrimMessages) {
            var room = getRoomElements(roomName);
            room.setTrimmable(canTrimMessages);
        },
        prependChatMessages: function (messages, roomName) {
            var room = getRoomElements(roomName),
                $messages = room.messages,
                $target = $messages.children().first(),
                $previousMessage = null,
                previousUser = null,
                previousTimestamp = new Date().addDays(1); // Tomorrow so we always see a date line

            if (messages.length === 0) {
                // Mark this list as full
                $messages.data('full', true);
                return;
            }

            // If our top message is a date header, it might be incorrect, so we
            // check to see if we should remove it so that it can be inserted
            // again at a more appropriate time.
            if ($target.is('.list-header.date-header')) {
                var postedDate = new Date($target.text()).toDate();
                var lastPrependDate = messages[messages.length - 1].date.toDate();

                if (!lastPrependDate.diffDays(postedDate)) {
                    $target.remove();
                    $target = $messages.children().first();
                }
            }

            // Populate the old messages
            $.each(messages, function () {
                processMessage(this, roomName);

                if ($previousMessage) {
                    previousUser = $previousMessage.data('name');
                    previousTimestamp = new Date($previousMessage.data('timestamp') || new Date());
                }

                if (this.date.toDate().diffDays(previousTimestamp.toDate())) {
                    ui.addMessageBeforeTarget(this.date.toLocaleDateString(), 'list-header', $target)
                      .addClass('date-header')
                      .find('.right').remove(); // remove timestamp on date indicator

                    // Force a user name to show after the header
                    previousUser = null;
                }

                // Determine if we need to show the user
                this.showUser = !previousUser || previousUser !== this.name;

                // Render the new message
                $target.before(templates.message.tmpl(this));

                if (this.showUser === false) {
                    $previousMessage.addClass('continue');
                }

                $previousMessage = $('#m-' + this.id);
            });

            // If our old top message is a message from the same user as the
            // last message in our prepended history, we can remove information
            // and continue
            if ($target.is('.message') && $target.data('name') === $previousMessage.data('name')) {
                $target.find('.left').children().not('.state').remove();
                $previousMessage.addClass('continue');
            }

            // Scroll to the bottom element so the user sees there's more messages
            $target[0].scrollIntoView();
        },
        addChatMessage: function (message, roomName) {
            var room = getRoomElements(roomName),
                $previousMessage = room.messages.children().last(),
                previousUser = null,
                previousTimestamp = new Date().addDays(1), // Tomorrow so we always see a date line
                showUserName = true,
                $message = null,
                isMention = message.highlight,
                notify = getRoomPreference(roomName, 'notify') || 'mentions',
                isNotification = message.messageType === 1;

            // bounce out of here if the room is closed
            if (room.isClosed()) {
                return;
            }

            if ($previousMessage.length > 0) {
                previousUser = $previousMessage.data('name');
                previousTimestamp = new Date($previousMessage.data('timestamp') || new Date());
            }

            // Force a user name to show if a header will be displayed
            if (message.date.toDate().diffDays(previousTimestamp.toDate())) {
                previousUser = null;
            }

            // Determine if we need to show the user name next to the message
            showUserName = previousUser !== message.name && !isNotification;
            message.showUser = showUserName;

            processMessage(message, roomName);

            if (showUserName === false) {
                $previousMessage.addClass('continue');
            }

            // check to see if room needs a separator
            if (room.needsSeparator()) {
                // if there's an existing separator, remove it
                if (room.hasSeparator()) {
                    room.removeSeparator();
                }
                room.addSeparator();
            }

            if (isNotification === true) {
                var model = {
                    id: message.id,
                    content: message.message,
                    img: message.imageUrl,
                    source: message.source,
                    encoded: true
                };

                ui.addMessage(model, 'postedNotification', roomName);
            }
            else {
                this.appendMessage(templates.message.tmpl(message), room);
            }

            if (message.htmlContent) {
                ui.addChatMessageContent(message.id, message.htmlContent, room.getName());
            }

            var currentRoomName = getCurrentRoomElements().getName();
            var roomFocus = roomName == currentRoomName && focus;

            if (room.isInitialized()) {
                if (isMention) {
                    // Mention Sound
                    if (roomFocus === false && getRoomPreference(roomName, 'hasSound') === true) {
                        ui.notify(true);
                    }
                    // Mention Popup
                    if (roomFocus === false && getRoomPreference(roomName, 'canToast') === true) {
                        ui.toast(message, true, roomName);
                    }
                } else if (notify == 'all') {
                    // All Sound
                    if (roomFocus === false && getRoomPreference(roomName, 'hasSound') === true) {
                        ui.notifyRoom(roomName);
                    }
                    // All Popup
                    if (roomFocus === false && getRoomPreference(roomName, 'canToast') === true) {
                        ui.toastRoom(roomName, message);
                    }
                }
            }
        },
        overwriteMessage: function (id, message) {
            var $message = $('#m-' + id);
            processMessage(message);

            $message.find('.middle').html(message.message);
            $message.attr('id', 'm-' + message.id);

            $ui.trigger(ui.events.setMessageId, [id, message.id]);

        },
        replaceMessage: function (message) {
            processMessage(message);

            $('#m-' + message.id).find('.middle')
                                 .html(message.message);
        },
        messageExists: function (id) {
            return $('#m-' + id).length > 0;
        },
        addChatMessageContent: function (id, content, roomName) {
            var $message = $('#m-' + id),
                $middle = $message.find('.middle'),
                $body = $message.find('.content');

            if (shouldCollapseContent(content, roomName)) {
                content = collapseRichContent(content);
            }

            if ($middle.length === 0) {
                $body.append('<p>' + content + '</p>');
            }
            else {
                $middle.append(processRichContent($('<p>' + content + '</p>')));
            }
        },
        addPrivateMessage: function (content, type) {
            var rooms = getAllRoomElements();
            for (var r in rooms) {
                if (rooms[r].getName() !== undefined && rooms[r].isClosed() === false) {
                    this.addMessage(content, type, rooms[r].getName());
                }
            }
        },
        prepareNotificationMessage: function (options, type) {
            if (typeof options === 'string') {
                options = { content: options, encoded: false };
            }

            var now = new Date(),
            message = {
                message: options.encoded ? options.content : ui.processContent(options.content),
                type: type,
                date: now,
                when: now.formatTime(true),
                fulldate: now.toLocaleString(),
                img: options.img,
                source: options.source,
                id: options.id
            };

            return templates.notification.tmpl(message);
        },
        addMessageBeforeTarget: function (content, type, $target) {
            var $element = null;

            $element = ui.prepareNotificationMessage(content, type);

            $target.before($element);

            return $element;
        },
        addMessage: function (content, type, roomName) {
            var room = roomName ? getRoomElements(roomName) : getCurrentRoomElements(),
                nearEnd = room.isNearTheEnd(),
                $element = null;

            $element = ui.prepareNotificationMessage(content, type);

            this.appendMessage($element, room);

            if (type === 'notification' && room.isLobby() === false) {
                ui.collapseNotifications($element);
            }

            if (nearEnd) {
                ui.scrollToBottom(roomName);
            }

            return $element;
        },
        appendMessage: function (newMessage, room) {
            // Determine if we need to show a new date header: Two conditions
            // for instantly skipping are if this message is a date header, or
            // if the room only contains non-chat messages and we're adding a
            // non-chat message.
            var isMessage = $(newMessage).is('.message');
            if (!$(newMessage).is('.date-header') && (isMessage || room.hasMessages())) {
                var lastMessage = room.messages.find('li[data-timestamp]').last(),
                    lastDate = new Date(lastMessage.data('timestamp')),
                    thisDate = new Date($(newMessage).data('timestamp'));

                if (!lastMessage.length || thisDate.toDate().diffDays(lastDate.toDate())) {
                    var dateDisplay = moment(thisDate);
                    ui.addMessage(dateDisplay.format('dddd, MMMM Do YYYY'), 'date-header list-header', room.getName())
                      .find('.right').remove(); // remove timestamp on date indicator
                }
            }

            if (isMessage) {
                room.updateMessages(true);
            }

            $(newMessage).appendTo(room.messages);
        },
        hasFocus: function () {
            return focus;
        },
        getShortcuts: function () {
            return ui.shortcuts;
        },
        setShortcuts: function (shortcuts) {
            ui.shortcuts = shortcuts;
        },
        getCommands: function () {
            return ui.commands;
        },
        setCommands: function (commands) {
            ui.commands = commands;
        },
        setInitialized: function (roomName) {
            var room = roomName ? getRoomElements(roomName) : getCurrentRoomElements();
            room.setInitialized();
        },
        collapseNotifications: function ($notification) {
            // collapse multiple notifications
            var $notifications = $notification.prevUntil(':not(.notification)');
            if ($notifications.length > 3) {
                $notifications
                    .hide()
                    .find('.info').text('');    // clear any prior text
                $notification.find('.info')
                    .text(' (plus ' + $notifications.length + ' hidden... click to expand)')
                    .removeClass('collapse');
            }
        },
        expandNotifications: function ($notification) {
            // expand collapsed notifications
            var $notifications = $notification.prevUntil(':not(.notification)'),
                topBefore = $notification.position().top;

            $notification.find('.info')
                .text(' (click to collapse)')
                .addClass('collapse');
            $notifications.show();

            var room = getCurrentRoomElements(),
                topAfter = $notification.position().top,
                scrollTop = room.messages.scrollTop();

            // make sure last notification is visible
            room.messages.scrollTop(scrollTop + topAfter - topBefore + $notification.height());
        },
        getState: function () {
            return preferences;
        },
        notifyRoom: function (roomName) {
            if (getRoomPreference(roomName, 'hasSound') === true) {
                $('#notificationSound')[0].play();
            }
        },
        toastRoom: function (roomName, message) {
            if (getRoomPreference(roomName, 'canToast') === true) {
                toast.toastMessage(message, roomName);
            }
        },
        notify: function (force) {
            if (getActiveRoomPreference('hasSound') === true || force) {
                $('#notificationSound')[0].play();
            }
        },
        toast: function (message, force, roomName) {
            if (getActiveRoomPreference('canToast') === true || force) {
                toast.toastMessage(message, roomName);
            }
        },
        setUserName: function (name) {
            ui.name = name;
        },
        setUnreadNotifications: function (unreadCount) {
            if (unreadCount > 0) {
                $unreadNotificationCount.text(unreadCount);
                $unreadNotificationCount.show();
            } else {
                $unreadNotificationCount.text('');
                $unreadNotificationCount.hide();
            }
        },
        getUserName: function () {
            return ui.name;
        },
        showLogin: function () {
            $login.modal({ backdrop: true, keyboard: true });
            return true;
        },
        showDisconnectUI: function () {
            $disconnectDialog.modal();
        },
        showHelp: function () {
            $shortCutHelp.empty();
            $globalCmdHelp.empty();
            $roomCmdHelp.empty();
            $userCmdHelp.empty();
            $.each(ui.getCommands(), function () {
                switch (this.Group) {
                    case ui.help.shortcut:
                        $shortCutHelp.append(templates.commandhelp.tmpl(this));
                        break;
                    case ui.help.global:
                        $globalCmdHelp.append(templates.commandhelp.tmpl(this));
                        break;
                    case ui.help.room:
                        $roomCmdHelp.append(templates.commandhelp.tmpl(this));
                        break;
                    case ui.help.user:
                        $userCmdHelp.append(templates.commandhelp.tmpl(this));
                        break;
                }
            });
            $.each(ui.getShortcuts(), function () {
                $shortCutHelp.append(templates.commandhelp.tmpl(this));
            });
            $helpPopup.modal();
        },
        showClipboardUpload: function (file) {
            //set image url
            $clipboardUploadPreview.attr("src", file.dataURL);
            $clipboardUpload.modal();
        },
        showUpdateUI: function () {
            $updatePopup.modal();

            window.setTimeout(function () {
                // Reload the page
                document.location = document.location.pathname;
            },
            updateTimeout);
        },
        showReloadMessageNotification: function () {
            $reloadMessageNotification.appendTo($chatArea);
            $reloadMessageNotification.show();
        },
        showStatus: function (status, transport) {
            // Change the status indicator here
            if (connectionState !== status) {
                if (popoverTimer) {
                    clearTimeout(popoverTimer);
                }
                connectionState = status;
                $connectionStatus.popover('destroy');
                switch (status) {
                    case 0: // Connected
                        $connectionStatus.removeClass('reconnecting disconnected');
                        $connectionStatus.popover(getConnectionStateChangedPopoverOptions('You\'re connected.'));
                        $connectionStateChangedPopover.find(connectionStateIcon).addClass('icon-ok-sign');
                        $connectionStatus.popover('show');
                        popoverTimer = setTimeout(function () {
                            $connectionStatus.popover('destroy');
                            ui.initializeConnectionStatus(transport);
                            popoverTimer = null;
                        }, 2000);
                        break;
                    case 1: // Reconnecting
                        $connectionStatus.removeClass('disconnected').addClass('reconnecting');
                        $connectionStatus.popover(getConnectionStateChangedPopoverOptions('The connection to JabbR has been temporarily lost, trying to reconnect.'));
                        $connectionStateChangedPopover.find(connectionStateIcon).addClass('icon-question-sign');
                        $connectionStatus.popover('show');
                        popoverTimer = setTimeout(function () {
                            $connectionStatus.popover('hide');
                            popoverTimer = null;
                        }, 5000);
                        break;
                    case 2: // Disconnected
                        $connectionStatus.removeClass('reconnecting').addClass('disconnected');
                        $connectionStatus.popover(getConnectionStateChangedPopoverOptions('The connection to JabbR has been lost, trying to reconnect.'));
                        $connectionStateChangedPopover.find(connectionStateIcon).addClass('icon-exclamation-sign');
                        $connectionStatus.popover('show');
                        popoverTimer = setTimeout(function () {
                            $connectionStatus.popover('hide');
                            popoverTimer = null;
                        }, 5000);
                        break;
                }
            }
        },
        setReadOnly: function (isReadOnly) {
            readOnly = isReadOnly;

            if (readOnly === true) {
                $hiddenFile.attr('disabled', 'disabled');
                $submitButton.attr('disabled', 'disabled');
                $newMessage.attr('disabled', 'disabled');
                $fileUploadButton.attr('disabled', 'disabled');
            }
            else {
                $hiddenFile.removeAttr('disabled');
                $submitButton.removeAttr('disabled');
                $newMessage.removeAttr('disabled');
                $fileUploadButton.removeAttr('disabled');
            }
        },
        initializeConnectionStatus: function (transport) {
            $connectionStatus.popover(getConnectionInfoPopoverOptions(transport));
        },
        changeNote: function (userViewModel, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUser(userViewModel.name);

            updateNote(userViewModel, $user);
        },
        changeFlag: function (userViewModel, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUser(userViewModel.name);

            updateFlag(userViewModel, $user);
        },
        changeRoomTopic: function (roomViewModel) {
            updateRoomTopic(roomViewModel);
        },
        confirmMessage: function (id) {
            $('#m-' + id).removeClass('failed')
                         .removeClass('loading');
        },
        failMessage: function (id) {
            $('#m-' + id).removeClass('loading')
                         .addClass('failed');
        },
        markMessagePending: function (id) {
            var $message = $('#m-' + id);

            if ($message.hasClass('failed') === false) {
                $message.addClass('loading');
            }
        },
        setRoomAdmin: function (adminName, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUser(adminName);
            $user
                .attr('data-admin', true)
                .data('admin', true)
                .find('.admin')
                .text('(admin)');
            room.updateUserStatus($user);
        },
        clearRoomAdmin: function (adminName, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUser(adminName);
            $user
                 .removeAttr('data-admin')
                 .data('admin', false)
                 .find('.admin')
                 .text('');
            room.updateUserStatus($user);
        },
        setLastPrivate: function (userName) {
            lastPrivate = userName;
        },
        shouldCollapseContent: shouldCollapseContent,
        collapseRichContent: collapseRichContent,
        toggleMessageSection: function (disabledIt) {
            if (disabledIt) {
                // disable send button, textarea and file upload
                $newMessage.attr('disabled', 'disabled');
                $submitButton.attr('disabled', 'disabled');
                $fileUploadButton.attr('disabled', 'disabled');
                $hiddenFile.attr('disabled', 'disabled');
            } else if (!readOnly) {
                // re-enable textarea button
                $newMessage.attr('disabled', '');
                $newMessage.removeAttr('disabled');

                // re-enable submit button
                $submitButton.attr('disabled', '');
                $submitButton.removeAttr('disabled');

                // re-enable file upload button
                $fileUploadButton.attr('disabled', '');
                $fileUploadButton.removeAttr('disabled');
                $hiddenFile.attr('disabled', '');
                $hiddenFile.removeAttr('disabled');
            }
        },
        closeRoom: function (roomName) {
            var room = getRoomElements(roomName);

            room.close();
        },
        unCloseRoom: function (roomName) {
            var room = getRoomElements(roomName);

            room.unClose();
        },
        setRoomListStatuses: function (roomName) {
            var room = roomName ? getRoomElements(roomName) : getCurrentRoomElements();
            room.setListState(room.owners);
        },
        processContent: function (content) {
            return utility.processContent(content, templates, roomCache);
        },
        trimRoomMessageHistory: function (roomName) {
            var rooms = roomName ? [getRoomElements(roomName)] : getAllRoomElements();

            for (var i = 0; i < rooms.length; i++) {
                rooms[i].trimHistory();
            }
        }
    };

    if (!window.chat) {
        window.chat = {};
    }
    window.chat.ui = ui;
})(jQuery, window, window.document, window.chat, window.chat.utility, window.Emoji, window.linkify);
