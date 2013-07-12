﻿/*global define*/
define([
    'jquery',
    'logger',
    'jquery.timeago'
], function ($, Logger) {
    var logger = new Logger('jabbr/viewmodels/user'),
        ru = null;

    function getNoteCssClass(user) {
        if (user.IsAfk === true) {
            return 'afk';
        } else if (user.Note) {
            return 'message';
        }
        return '';
    }

    function getNote(user) {
        if (user.IsAfk === true) {
            if (user.AfkNote) {
                return 'AFK - ' + user.AfkNote;
            }
            return 'AFK';
        }

        return user.Note;
    }

    function getFlagCssClass(user) {
        return (user.Flag) ? 'flag flag-' + user.Flag : '';
    }

    function update(user, userdata) {
        var lastActive = userdata.LastActivity.fromJsonDate();

        user.name = userdata.Name;
        user.hash = userdata.Hash;

        user.admin = userdata.IsAdmin;

        user.active = userdata.Active;

        user.noteClass = getNoteCssClass(userdata);
        user.note = getNote(userdata);

        user.flagClass = getFlagCssClass(userdata);
        user.flag = userdata.Flag;
        user.country = userdata.Country;

        user.lastActive = lastActive;
        user.timeAgo = $.timeago(lastActive);

        user.mention = userdata.Mention;
    }

    function User(roomUi, userdata, isOwner) {
        ru = roomUi;

        this.owner = isOwner;
        update(this, userdata);

        this.roomUsers = {};  // { <roomName>: <RoomUser> }
    }

    User.prototype.update = function (userdata) {
        update(this, userdata);
    };

    User.prototype.each = function (callback) {
        $.each(this.roomUsers, callback);
    };

    User.prototype.setUserActivity = function(userdata) {
        this.update(userdata);

        this.each(function(roomName, roomUser) {
            logger.trace('setUserActivity  (' + roomUser.user.name + ') #' + roomName);

            var $roomUser = roomUser.$roomUser,
                $idleSince = $roomUser.find('.idle-since');

            if (roomUser.user.active === true) {
                if ($roomUser.hasClass('idle')) {
                    $roomUser.removeClass('idle');
                    $idleSince.livestamp('destroy');
                }
            } else {
                if (!$roomUser.hasClass('idle')) {
                    $roomUser.addClass('idle');
                }

                if (!$idleSince.html()) {
                    $idleSince.livestamp(roomUser.user.lastActive);
                }
            }

            roomUser.updateNote();
        });
    };

    User.prototype.changeUserName = function(userdata) {
        var oldName = this.name;

        update(this, userdata);

        // Only update if name has actually changed
        if (oldName != this.name) {
            $.each(this.roomUsers, function(roomName, roomUser) {
                roomUser.updateUserName();
            });
        }
    };

    User.prototype.changeGravatar = function(userdata) {
        var oldHash = this.hash;

        update(this, userdata);

        // Only update if gravatar has actually changed
        if (oldHash != this.hash) {
            $.each(this.roomUsers, function(roomName, roomUser) {
                roomUser.updateGravatar();
            });
        }
    };

    User.prototype.changeMentions = function (userdata) {
        var oldMention = this.mention;

        update(this, userdata);

        // Only update if gravatar has actually changed
        if (oldMention != this.mention) {
            $.each(this.roomUsers, function(roomName, roomUser) {
                roomUser.updateMentions();
            });
        }
    };

    User.prototype.changeNote = function(userdata) {
        var oldNote = this.note;

        update(this, userdata);

        // Only update if note has actually changed
        if (oldNote != this.note) {
            $.each(this.roomUsers, function (roomName, roomUser) {
                roomUser.updateNote();
            });
        }
    };

    User.prototype.changeFlag = function (userdata) {
        var oldFlag = this.flag;

        update(this, userdata);

        // Only update if flag has actually changed
        if (oldFlag != this.flag) {
            $.each(this.roomUsers, function (roomName, roomUser) {
                roomUser.updateFlag();
            });
        }
    };

    return User;
});