﻿/*global define, window, document*/
define([
    'jquery',
    'logger',
    'kernel',
    'jabbr/state',
    'jabbr/events',
    'jabbr/viewmodels/message'
], function ($, Logger, kernel, state, events, Message) {
    var logger = new Logger('jabbr/components/rooms.client'),
        ru = null,
        client = null,
        ui = null,
        users = null,
        messages = null,
        lobby = null,
        object = null;

    logger.trace('loaded');

    var initialize = function () {
        var $this = $(this),
            rooms = {},
            messageHistory = {},
            pendingMessages = {},
            messageIds = [],
            historyLocation = 0,
            loadingHistory = false;

        //
        // Functions
        //

        //#region Core Room Functions (get, has, validate)

        function getRoom(roomName) {
            if (!hasRoom(roomName)) {
                return null;
            }
            if (!validRoom(roomName)) {
                if (!ru.updateRoom(roomName)) {
                    return null;
                }
            }
            return rooms[roomName];
        }

        function hasRoom(roomName) {
            return roomName in rooms;
        }

        function validRoom(roomName) {
            return rooms[roomName].exists();
        }

        function removeRoom(roomName) {
            var room = getRoom(roomName),
                scrollHandler = null;

            if (room !== null) {
                // Remove the scroll handler from this room
                scrollHandler = room.messages.data('scrollHandler');
                room.messages.unbind('scrollHandler', scrollHandler);

                room.tab.remove();
                room.messages.remove();
                room.users.remove();
                room.roomTopic.remove();
                ru.setAccessKeys();
            }

            if (hasRoom(roomName)) {
                logger.trace('Deleting room "' + roomName + '"');

                users.removeRoomUsers(roomName);

                delete rooms[roomName];
            }
        }

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

        //#endregion

        function isSelf(userdata) {
            return client.chat.state.name === userdata.Name;
        }

        function setInitialized(roomName) {
            var room = roomName ? getRoom(roomName) : ru.getCurrentRoomElements();
            room.setInitialized();
        }

        function setRoomTrimmable(roomName, canTrimMessages) {
            var room = getRoom(roomName);
            room.setTrimmable(canTrimMessages);
        }

        // #region Join, Set, Populate Room Functions

        function joinRoom(roomName) {
            logger.trace('joinRoom(' + roomName + ')');
            try {
                client.chat.server.send('/join ' + roomName, client.chat.state.activeRoom)
                    .fail(function (e) {
                        // TODO: setActiveRoom('Lobby');
                        $this.trigger(events.error, [e, 'error']);
                    });
            } catch (e) {
                client.connection.hub.log('openRoom failed');
            }
        }

        function setActiveRoom(roomName) {
            logger.trace('setActiveRoom(' + roomName + ')');

            var hash = (document.location.hash || '#').substr(1),
                hashRoomName = getRoomNameFromHash(hash);

            if (hashRoomName && hashRoomName === roomName) {
                ru.setActiveRoomCore(roomName);
            } else {
                document.location.hash = '#/rooms/' + roomName;
            }
        }

        function activateOrOpenRoom(roomName) {
            logger.trace('activateOrOpenRoom(' + roomName + ')');

            if (hasRoom(roomName)) {
                setActiveRoom(roomName);
            } else {
                joinRoom(roomName);
            }
        }

        function populateRoom(room) {
            var d = $.Deferred();

            client.connection.hub.log('getRoomInfo(' + room + ')');

            // Populate the list of users rooms and messages
            client.chat.server.getRoomInfo(room).done(function (roomInfo) {
                client.connection.hub.log('getRoomInfo.done(' + room + ')');

                $.each(roomInfo.Users, function () {
                    users.createRoomUser(this, room);
                });

                $.each(roomInfo.Owners, function () {
                    var user = users.get(this);

                    if (user !== undefined && room in user.roomUsers) {
                        user.roomUsers[room].setOwner(true);
                    } else {
                        logger.warn('unable to find user "' + this + '"');
                    }
                });

                logger.info('loading recent messages');
                $.each(roomInfo.RecentMessages, function () {
                    this.isHistory = true;
                    $this.trigger(events.rooms.client.createMessage, [this, room]);
                });
                logger.info('finished loading recent messages');

                ru.updateRoomTopic(roomInfo);

                // mark room as initialized to differentiate messages
                // that are added after initial population
                setInitialized(room);
                ru.scrollToBottom(room);
                //TODO: ui.setRoomListStatuses(room);

                d.resolveWith(client.chat);

                // Watch the messages after the defer, since room messages
                // may be appended if we are just joining the room
                messages.watchMessageScroll(messageIds, room);
            }).fail(function (e) {
                client.connection.hub.log('getRoomInfo.failed(' + room + ', ' + e + ')');
                d.rejectWith(client.chat);
            });

            return d.promise();
        }

        // #endregion

        function openRoomFromHash() {
            $.history.init(function (hash) {
                var roomName = getRoomNameFromHash(hash);

                if (roomName) {
                    if (ru.setActiveRoomCore(roomName) === false &&
                        roomName !== 'Lobby') {
                        joinRoom(roomName);
                    }
                }
            });
        }

        function scrollRoomTop(roomInfo) {
            // Do nothing if we're loading history already
            if (loadingHistory === true) {
                return;
            }

            loadingHistory = true;

            try {
                // Show a little animation so the user experience looks fancy
                ru.setLoadingHistory(true);
                setRoomTrimmable(roomInfo.name, false);
                
                logger.trace('getPreviousMessages(' + roomInfo.name + ')');
                
                client.chat.server.getPreviousMessages(roomInfo.messageId)
                    .done(function (previousMessages) {
                        logger.trace('getPreviousMessages.done(' + roomInfo.name + ')');
                        
                        // Insert message history into the room
                        messages.prependChatMessages($.map(previousMessages, function (data) {
                            return new Message(data);
                        }), roomInfo.name);
                        
                        loadingHistory = false;
                        ru.setLoadingHistory(false);
                    })
                    .fail(function (e) {
                        logger.trace('getPreviousMessages.failed(' + roomInfo.name + ', ' + e + ')');
                        
                        loadingHistory = false;
                        ru.setLoadingHistory(false);
                    });
            } catch (e) {
                logger.trace('getPreviousMessages failed');
                ru.setLoadingHistory(false);
            }
        }

        //
        // Hub Handlers
        //

        var handlers = {
            bind: function () {
                client.chat.client.roomClosed = this.roomClosed;
                client.chat.client.roomUnClosed = this.roomUnClosed;
                client.chat.client.lockRoom = this.lockRoom;

                client.chat.client.leave = this.leave;

                client.chat.client.listUsers = this.listUsers;
                client.chat.client.listAllowedUsers = this.listAllowedUsers;

                client.chat.client.showUsersRoomList = this.showUsersRoomList;
                client.chat.client.showUsersOwnedRoomList = this.showUsersOwnedRoomList;
                client.chat.client.showUsersInRoom = this.showUsersInRoom;
                client.chat.client.showRooms = this.showRooms;
                client.chat.client.showUserInfo = this.showUserInfo;
            },

            roomClosed: function (roomName) {
                messages.addMessage('Room \'' + roomName + '\' is now closed', 'notification', state.get().activeRoom);

                var room = getRoom(roomName);

                if (room !== null) {
                    room.setClosed(true);

                    if (state.get().activeRoom === roomName) {
                        ui.toggleMessageSection(true);
                    }
                }
            },

            roomUnClosed: function (roomName) {
                messages.addMessage('Room \'' + roomName + '\' is now open', 'notification', state.get().activeRoom);

                var room = getRoom(roomName);

                if (room !== null) {
                    room.setClosed(false);

                    if (state.get().activeRoom === roomName) {
                        ui.toggleMessageSection(false);
                    }
                }
            },

            lockRoom: function (userdata, roomName) {
                if (!isSelf(userdata) && state.get().activeRoom === roomName) {
                    messages.addMessage(userdata.Name + ' has locked ' + roomName + '.', 'notification', state.get().activeRoom);
                }

                var room = getRoom(roomName);

                if (room !== null) {
                    room.setLocked(true);
                    lobby.lockRoom(roomName);
                }
            },

            leave: function (userdata, roomName) {
                if (isSelf(userdata)) {
                    setActiveRoom('Lobby');
                    removeRoom(roomName);
                } else {
                    users.remove(userdata, roomName);
                    messages.addMessage(userdata.Name + ' left ' + roomName, 'notification', roomName);
                }
            },

            listAllowedUsers: function (roomName, isPrivate, allowedUsers) {
                if (!isPrivate) {
                    messages.addMessage('Anyone is allowed in ' + roomName + ' as it is not private', 'list-header');
                } else if (allowedUsers.length === 0) {
                    messages.addMessage('No users are allowed in ' + roomName, 'list-header');
                } else {
                    messages.addMessage('The following users are allowed in ' + roomName, 'list-header');
                    messages.addMessage(allowedUsers.join(', '), 'list-item');
                }
            },

            showUsersRoomList: function (user, inRooms) {
                var status = "Currently " + user.Status;

                if (inRooms.length === 0) {
                    messages.addMessage(user.Name + ' (' + status + ') is not in any rooms', 'list-header');
                } else {
                    messages.addMessage(user.Name + ' (' + status + ') is in the following rooms', 'list-header');
                    messages.addMessage(inRooms.join(', '), 'list-item');
                }
            },

            showUsersOwnedRoomList: function (username, ownedRooms) {
                if (ownedRooms.length === 0) {
                    messages.addMessage(username + ' does not own any rooms', 'list-header');
                } else {
                    messages.addMessage(username + ' owns the following rooms', 'list-header');
                    messages.addMessage(ownedRooms.join(', '), 'list-item');
                }
            },

            listUsers: function (users) {
                if (users.length === 0) {
                    messages.addMessage('No users matched your search', 'list-header');
                } else {
                    messages.addMessage('The following users match your search', 'list-header');
                    messages.addMessage(users.join(', '), 'list-item');
                }
            },

            showUsersInRoom: function (roomName, usernames) {
                messages.addMessage('Users in ' + roomName, 'list-header');
                if (usernames.length === 0) {
                    messages.addMessage('Room is empty', 'list-item');
                } else {
                    $.each(usernames, function () {
                        messages.addMessage('- ' + this, 'list-item');
                    });
                }
            },

            showRooms: function (rooms) {
                messages.addMessage('Rooms', 'list-header');
                if (!rooms.length) {
                    messages.addMessage('No rooms available', 'list-item');
                } else {
                    // sort rooms by count descending then name
                    var sorted = rooms.sort(function (a, b) {
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

                    $.each(sorted, function () {
                        messages.addMessage(this.Name + ' (' + this.Count + ')', 'list-item');
                    });
                }
            },

            showUserInfo: function (user) {
                var lastActivityDate = user.LastActivity.fromJsonDate();
                var status = "Currently " + user.Status;
                if (user.IsAfk) {
                    status += user.Status === 'Active' ? ' but ' : ' and ';
                    status += ' is Afk';
                }
                messages.addMessage('User information for ' + user.Name +
                    " (" + status + " - last seen " + $.timeago(lastActivityDate) + ")", 'list-header');

                if (user.AfkNote) {
                    messages.addMessage('Afk: ' + user.AfkNote, 'list-item');
                } else if (user.Note) {
                    messages.addMessage('Note: ' + user.Note, 'list-item');
                }

                $.getJSON('https://secure.gravatar.com/' + user.Hash + '.json?callback=?', function (profile) {
                    ru.showGravatarProfile(profile.entry[0]);
                });

                this.howUsersOwnedRoomList(user.Name, user.OwnedRooms);
            }
        };

        return {
            activate: function () {
                ru = kernel.get('jabbr/components/rooms.ui');
                client = kernel.get('jabbr/client');
                ui = kernel.get('jabbr/ui');
                users = kernel.get('jabbr/components/users');
                messages = kernel.get('jabbr/components/messages');
                lobby = kernel.get('jabbr/components/lobby');

                logger.trace('activated');

                handlers.bind();
            },

            messageHistory: messageHistory,
            pendingMessages: pendingMessages,

            rooms: rooms,
            getRoom: getRoom,
            hasRoom: hasRoom,
            validRoom: validRoom,
            removeRoom: removeRoom,
            getRoomNameFromHash: getRoomNameFromHash,
            setActiveRoom: setActiveRoom,
            activateOrOpenRoom: activateOrOpenRoom,
            openRoomFromHash: openRoomFromHash,

            isSelf: isSelf,

            setInitialized: setInitialized,
            setRoomTrimmable: setRoomTrimmable,

            getRoomId: function (roomName) {
                return window.escape(roomName.toString().toLowerCase()).replace(/[^A-Za-z0-9]/g, '_');
            },

            activeRoomChanged: function (room) {
                if (room === 'Lobby') {
                    $this.trigger(events.rooms.client.lobbyOpened);

                    // Remove the active room
                    client.chat.state.activeRoom = undefined;
                } else {
                    // When the active room changes update the client state and the cookie
                    client.chat.state.activeRoom = room;
                }

                $this.trigger(events.rooms.client.scrollToBottom, room);
                state.save(client.chat.state.activeRoom);

                historyLocation = (messageHistory[client.chat.state.activeRoom] || []).length - 1;
            },
            populateRoom: populateRoom,
            scrollRoomTop: scrollRoomTop,

            joinRoom: joinRoom,
            leaveRoom: function (roomName) {
                logger.trace('leaveRoom(' + roomName + ')');
                try {
                    client.chat.server.send('/leave ' + roomName, client.chat.state.activeRoom)
                        .fail(function (e) {
                            $this.trigger(events.error, [e, 'error']);
                        });
                } catch (e) {
                    // This can fail if the server is offline
                    client.connection.hub.log('closeRoom room failed');
                }
            },

            addMessage: function (message) {
                messageIds.push(message.id);
            },

            bind: function (eventType, handler) {
                $this.bind(eventType, handler);
            }
        };
    };

    return function () {
        if (object === null) {
            object = initialize();
            kernel.bind('jabbr/components/rooms.client', object);
        }

        return object;
    };
});