﻿/*global define*/
define([
    'jquery',
    'logger',
    'kernel',
    'jabbr/state',
    'jabbr/events'
], function ($, Logger, kernel, state, events) {
    var logger = new Logger('jabbr/components/notifications'),
        client = null,
        ui = null,
        rc = null,
        ru = null,
        messages = null,
        object = null;

    var initialize = function () {
        var $unreadNotificationCount = $('#notification-unread-count');

        function setUnreadNotifications(unreadCount) {
            if (unreadCount > 0) {
                $unreadNotificationCount.text(unreadCount);
                $unreadNotificationCount.show();
            } else {
                $unreadNotificationCount.text('');
                $unreadNotificationCount.hide();
            }
        }

        function clientLoggedOn() {
            setUnreadNotifications(client.chat.state.unreadNotifications);
        }

        function bindNotificationEvents() {
            client.chat.client.allowUser = function (room) {
                messages.addMessage('You were granted access to ' + room, 'notification', state.get().activeRoom);
            };

            client.chat.client.userAllowed = function (user, room) {
                messages.addMessage(user + ' now has access to ' + room, 'notification', state.get().activeRoom);
            };

            client.chat.client.unallowUser = function (user, room) {
                messages.addMessage('You access to ' + room + ' was revoked.', 'notification', state.get().activeRoom);
            };

            client.chat.client.userUnallowed = function (user, room) {
                messages.addMessage('You have revoked ' + user + '\'s access to ' + room, 'notification', state.get().activeRoom);
            };

            // Called when you make someone an owner
            client.chat.client.ownerMade = function (user, room) {
                messages.addMessage(user + ' is now an owner of ' + room, 'notification', state.get().activeRoom);
            };

            client.chat.client.ownerRemoved = function (user, room) {
                messages.addMessage(user + ' is no longer an owner of ' + room, 'notification', state.get().activeRoom);
            };

            // Called when you've been made an owner
            client.chat.client.makeOwner = function (room) {
                messages.addMessage('You are now an owner of ' + room, 'notification', state.get().activeRoom);
            };

            // Called when you've been removed as an owner
            client.chat.client.demoteOwner = function (room) {
                messages.addMessage('You are no longer an owner of ' + room, 'notification', state.get().activeRoom);
            };

            // Called when your gravatar has been changed
            client.chat.client.gravatarChanged = function () {
                messages.addMessage('Your gravatar has been set', 'notification', state.get().activeRoom);
            };

            // Called when the server sends a notification message
            client.chat.client.postNotification = function (msg, room) {
                messages.addMessage(msg, 'notification', room);
            };

            client.chat.client.setPassword = function () {
                messages.addMessage('Your password has been set', 'notification', state.get().activeRoom);
            };

            client.chat.client.changePassword = function () {
                messages.addMessage('Your password has been changed', 'notification', state.get().activeRoom);
            };

            // Called when you have added or cleared a note
            client.chat.client.noteChanged = function (isAfk, isCleared) {
                var afkMessage = 'You have gone AFK';
                var noteMessage = 'Your note has been ' + (isCleared ? 'cleared' : 'set');
                messages.addMessage(isAfk ? afkMessage : noteMessage, 'notification', state.get().activeRoom);
            };

            client.chat.client.welcomeChanged = function (isCleared, welcome) {
                var action = isCleared ? 'cleared' : 'set';
                var to = welcome ? ' to:' : '';
                var message = 'You have ' + action + ' the room welcome' + to;
                messages.addMessage(message, 'notification', state.get().activeRoom);
                if (welcome) {
                    messages.addMessage(welcome, 'welcome', state.get().activeRoom);
                }
            };

            // Called when you have added or cleared a flag
            client.chat.client.flagChanged = function (isCleared, country) {
                var action = isCleared ? 'cleared' : 'set';
                var place = country ? ' to ' + country : '';
                var message = 'You have ' + action + ' your flag' + place;
                messages.addMessage(message, 'notification', state.get().activeRoom);
            };

            client.chat.client.sendInvite = function (from, to, room) {
                if (ru.isSelf({ Name: to })) {
                    notify(true);
                    messages.addPrivateMessage('*' + from + '* has invited you to #' + room + '. Click the room name to join.', 'pm');
                }
                else {
                    messages.addPrivateMessage('Invitation to *' + to + '* to join #' + room + ' has been sent.', 'pm');
                }
            };

            // Called when you make someone an admin
            client.chat.client.adminMade = function (user) {
                messages.addMessage(user + ' is now an admin', 'notification', state.get().activeRoom);
            };

            client.chat.client.adminRemoved = function (user) {
                messages.addMessage(user + ' is no longer an admin', 'notification', state.get().activeRoom);
            };

            // Called when you've been made an admin
            client.chat.client.makeAdmin = function () {
                messages.addMessage('You are now an admin', 'notification', state.get().activeRoom);
            };

            // Called when you've been removed as an admin
            client.chat.client.demoteAdmin = function () {
                messages.addMessage('You are no longer an admin', 'notification', state.get().activeRoom);
            };

            client.chat.client.broadcastMessage = function (message, room) {
                messages.addMessage('ADMIN: ' + message, 'broadcast', room);
            };
            
            // Called when this user locked a room
            client.chat.client.roomLocked = function (room) {
                messages.addMessage(room + ' is now locked.', 'notification', state.get().activeRoom);
            };
        }

        function notifyRoom(roomName) {
            if (state.getRoomPreference(roomName, 'hasSound') === true) {
                $('#notificationSound')[0].play();
            }
        }

        function toastRoom(roomName, message) {
            if (state.getRoomPreference(roomName, 'canToast') === true) {
                toast.toastMessage(message, roomName);
            }
        }

        function notify(force) {
            if (ru.getActiveRoomPreference('hasSound') === true || force) {
                $('#notificationSound')[0].play();
            }
        }

        function toast(message, force, roomName) {
            if (ru.getActiveRoomPreference('canToast') === true || force) {
                toast.toastMessage(message, roomName);
            }
        }

        return {
            activate: function () {
                client = kernel.get('jabbr/client');
                ui = kernel.get('jabbr/ui');
                rc = kernel.get('jabbr/components/rooms.client');
                ru = kernel.get('jabbr/components/rooms.ui');
                messages = kernel.get('jabbr/components/messages');

                logger.trace('activated');

                // Bind events
                client.bind(events.client.loggedOn, clientLoggedOn);
                bindNotificationEvents();
            },

            notify: notify,
            messageNotification: function (message, room) {
                var roomName = room.getName(),
                    isMention = message.highlight,
                    notifyType = state.getRoomPreference(roomName, 'notify') || 'mentions',
                    currentRoomName = ru.getCurrentRoomElements().getName(),
                    roomFocus = roomName === currentRoomName && ui.isFocused();

                if (room.isInitialized()) {
                    var hasSound = state.getRoomPreference(roomName, 'hasSound'),
                        canToast = state.getRoomPreference(roomName, 'canToast');

                    if (isMention) {
                        // Mention Sound
                        if (roomFocus === false && hasSound === true) {
                            notify(true);
                        }
                        // Mention Popup
                        if (roomFocus === false && canToast === true) {
                            toast(message, true, roomName);
                        }
                    } else if (notifyType === 'all') {
                        // All Sound
                        if (roomFocus === false && hasSound === true) {
                            notifyRoom(roomName);
                        }
                        // All Popup
                        if (roomFocus === false && canToast === true) {
                            toastRoom(roomName, message);
                        }
                    }
                }
            }
        };
    };

    return function () {
        if (object === null) {
            object = initialize();
            kernel.bind('jabbr/components/notifications', object);
        }

        return object;
    };
});