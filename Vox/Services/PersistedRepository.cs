﻿using JabbR.Models;
using System;
using System.Data.Entity;
using System.Data.Entity.Core.Objects;
using System.Data.Entity.Core.Objects.DataClasses;
using System.Data.Entity.Infrastructure;
using System.Linq;

namespace JabbR.Services
{
    public class PersistedRepository : IJabbrRepository
    {
        private readonly JabbrContext _db;

        private static readonly Func<JabbrContext, string, ChatUser> getUserByName = (db, userName) => db.Users.FirstOrDefault(u => u.Name == userName);
        private static readonly Func<JabbrContext, string, ChatUser> getUserById = (db, userId) => db.Users.FirstOrDefault(u => u.Id == userId);
        private static readonly Func<JabbrContext, string, string, ChatUserIdentity> getIdentityByIdentity = (db, providerName, userIdentity) => db.Identities.Include(i => i.User).FirstOrDefault(u => u.Identity == userIdentity && u.ProviderName == providerName);
        private static readonly Func<JabbrContext, string, ChatRoom> getRoomByName = (db, roomName) => db.Rooms.FirstOrDefault(r => r.Name == roomName);
        private static readonly Func<JabbrContext, string, ChatClient> getClientById = (db, clientId) => db.Clients.FirstOrDefault(c => c.Id == clientId);
        private static readonly Func<JabbrContext, string, ChatClient> getClientByIdWithUser = (db, clientId) => db.Clients.Include(c => c.User).FirstOrDefault(u => u.Id == clientId);
        private static readonly Func<JabbrContext, string, string, DateTimeOffset, ChatUser> getUserByRequestResetPasswordId = (db, userName, requestId, now) => db.Users.FirstOrDefault(u => u.Name == userName && u.RequestPasswordResetId != null && u.RequestPasswordResetId.Equals(requestId, StringComparison.OrdinalIgnoreCase) && u.RequestPasswordResetValidThrough > now);

        public PersistedRepository(JabbrContext db)
        {
            _db = db;
        }

        public IQueryable<ChatRoom> Rooms
        {
            get { return _db.Rooms; }
        }

        public IQueryable<ChatUser> Users
        {
            get { return _db.Users; }
        }

        public IQueryable<ChatClient> Clients
        {
            get { return _db.Clients; }
        }
        public IQueryable<Settings> Settings
        {
            get { return _db.Settings; }
        }

        public void Add(Settings settings)
        {
            _db.Settings.Add(settings);
            _db.SaveChanges();
        }

        public void Add(ChatRoom room)
        {
            _db.Rooms.Add(room);
            _db.SaveChanges();
        }

        public void Add(ChatRoomUserData roomUserData)
        {
            _db.RoomUserData.Add(roomUserData);
            _db.SaveChanges();
        }

        public void Add(ChatUser user)
        {
            _db.Users.Add(user);
            _db.SaveChanges();
        }

        public void Add(Attachment attachment)
        {
            _db.Attachments.Add(attachment);
            _db.SaveChanges();
        }

        public void Add(ChatUserIdentity identity)
        {
            _db.Identities.Add(identity);
            _db.SaveChanges();
        }

        public void Add(ChatUserMention mention)
        {
            _db.Mentions.Add(mention);
            _db.SaveChanges();
        }

        public void Add(ChatMessage message)
        {
            _db.Messages.Add(message);
        }

        public void Add(Notification notification)
        {
            _db.Notifications.Add(notification);
        }

        public void Remove(ChatRoom room)
        {
            _db.Rooms.Remove(room);
            _db.SaveChanges();
        }

        public void Remove(ChatRoomUserData roomUserData)
        {
            _db.RoomUserData.Remove(roomUserData);
            _db.SaveChanges();
        }

        public void Remove(ChatUser user)
        {
            _db.Users.Remove(user);
            _db.SaveChanges();
        }

        public void Remove(ChatUserIdentity identity)
        {
            _db.Identities.Remove(identity);
            _db.SaveChanges();
        }

        public void Remove(ChatUserMention mention)
        {
            _db.Mentions.Remove(mention);
            _db.SaveChanges();
        }

        public void Remove(Notification notification)
        {
            _db.Notifications.Remove(notification);
            _db.SaveChanges();
        }

        public void Update(ChatMessage message)
        {
            ChatMessage updateMessage = _db.Messages.Where(p => p.Id == message.Id).FirstOrDefault();

            if (updateMessage != null)
            {
                _db.Entry(updateMessage).CurrentValues.SetValues(message);
            }

            _db.SaveChanges();
        }

        public void CommitChanges()
        {
            _db.SaveChanges();
        }

        public void Dispose()
        {
            _db.Dispose();
        }

        public ChatUser GetUserById(string userId)
        {
            return getUserById(_db, userId);
        }

        public ChatUser GetUserByName(string userName)
        {
            return getUserByName(_db, userName);
        }

        public ChatRoom GetRoomByName(string roomName)
        {
            return getRoomByName(_db, roomName);
        }

        public ChatMessage GetMessageById(string id)
        {
            return _db.Messages.FirstOrDefault(m => m.Id == id);
        }

        public int GetMessageCount()
        {
            return (int)_db.Database.SqlQuery<decimal>("SELECT IDENT_CURRENT('[dbo].[ChatMessages]')").FirstOrDefault();
        }

        public IQueryable<ChatRoom> GetAllowedRooms(ChatUser user)
        {
            // All public and private rooms the user can see.
            return _db.Rooms
                .Where(r =>
                       (!r.Private) ||
                       (r.Private && r.AllowedUsers.Any(u => u.Key == user.Key)));
        }

        public IQueryable<Notification> GetNotificationsByUser(ChatUser user, bool extended = false)
        {
            if (extended)
            {
                return _db.Notifications.Include(n => n.Room)
                          .Include(n => n.Message)
                          .Include(n => n.Message.User)
                          .Where(n => n.UserKey == user.Key);
            }

            return _db.Notifications.Where(n => n.UserKey == user.Key);
        }

        private IQueryable<ChatMessage> GetMessagesByRoom(string roomName)
        {
            return _db.Messages.Include(r => r.Room).Where(r => r.Room.Name == roomName);
        }

        public IQueryable<ChatMessage> GetMessagesByRoom(ChatRoom room)
        {
            return _db.Messages.Include(m => m.User)
                               .Include(m => m.Room)
                               .Where(m => m.RoomKey == room.Key);
        }

        public IQueryable<ChatMessage> GetPreviousMessages(string messageId)
        {
            var info = (from m in _db.Messages.Include(m => m.Room)
                        where m.Id == messageId
                        select new
                        {
                            m.When,
                            RoomName = m.Room.Name
                        }).FirstOrDefault();

            return from m in GetMessagesByRoom(info.RoomName)
                   where m.When < info.When
                   select m;
        }

        public IQueryable<ChatUser> GetOnlineUsers(ChatRoom room)
        {
            return _db.Entry(room)
                      .Collection(r => r.Users)
                      .Query()
                      .Online();
        }

        public IQueryable<ChatUser> GetOnlineUsers()
        {
            return _db.Users.Include(c => c.ConnectedClients).Online();
        }

        public IQueryable<ChatUser> SearchUsers(string name)
        {
            return _db.Users.Online().Where(u => u.Name.Contains(name));
        }

        public IQueryable<ChatUserMention> GetMentions()
        {
            return _db.Mentions;
        }

        public IQueryable<ChatUserMention> GetMentionsByUser(ChatUser user)
        {
            return _db.Mentions.Where(p => p.UserKey == user.Key);
        }

        public void AddUserRoom(ChatUser user, ChatRoom room)
        {
            RunNonLazy(() => room.Users.Add(user));
        }

        public void RemoveUserRoom(ChatUser user, ChatRoom room)
        {
            RunNonLazy(() =>
            {
                // The hack from hell to attach the user to room.Users so delete is tracked
                ObjectContext context = ((IObjectContextAdapter)_db).ObjectContext;
                RelationshipManager manger = context.ObjectStateManager.GetRelationshipManager(room);
                IRelatedEnd end = manger.GetRelatedEnd("JabbR.Models.ChatRoom_Users", "ChatRoom_Users_Target");
                end.Attach(user);

                room.Users.Remove(user);
            });
        }

        private void RunNonLazy(Action action)
        {
            bool old = _db.Configuration.LazyLoadingEnabled;
            try
            {
                _db.Configuration.LazyLoadingEnabled = false;
                action();
            }
            finally
            {
                _db.Configuration.LazyLoadingEnabled = old;
            }
        }

        public void Add(ChatClient client)
        {
            _db.Clients.Add(client);
            _db.SaveChanges();
        }

        public void Remove(ChatClient client)
        {
            _db.Clients.Remove(client);
            _db.SaveChanges();
        }

        public ChatUser GetUserByClientId(string clientId)
        {
            var client = GetClientById(clientId, includeUser: true);
            if (client != null)
            {
                return client.User;
            }
            return null;
        }

        public ChatUser GetUserByIdentity(string providerName, string userIdentity)
        {
            ChatUserIdentity identity = getIdentityByIdentity(_db, providerName, userIdentity);
            if (identity != null)
            {
                return identity.User;
            }
            return null;
        }

        public ChatUser GetUserByRequestResetPasswordId(string userName, string requestResetPasswordId)
        {
            return getUserByRequestResetPasswordId(_db, userName, requestResetPasswordId, DateTimeOffset.UtcNow);
        }

        public ChatRoomUserData GetRoomUserData(ChatUser user, ChatRoom room)
        {
            var roomUserData = _db.RoomUserData.FirstOrDefault(d => d.UserKey == user.Key && d.RoomKey == room.Key);

            if (roomUserData == null)
            {
                roomUserData = new ChatRoomUserData
                {
                    User = user,
                    Room = room,

                    IsMuted = false
                };

                Add(roomUserData);
            }

            return roomUserData;
        }

        public Notification GetNotificationById(int notificationId)
        {
            return _db.Notifications.SingleOrDefault(n => n.Key == notificationId);
        }

        public Notification GetNotificationByMessage(ChatMessage message, ChatUser user)
        {
            return _db.Notifications.SingleOrDefault(n => n.MessageKey == message.Key && n.UserKey == user.Key);
        }

        public ChatUser GetUserByLegacyIdentity(string userIdentity)
        {
            return _db.Users.FirstOrDefault(u => u.Identity == userIdentity);
        }

        public ChatClient GetClientById(string clientId, bool includeUser = false)
        {
            if (includeUser)
            {
                return getClientByIdWithUser(_db, clientId);
            }

            return getClientById(_db, clientId);
        }

        public bool IsUserInRoom(ChatUser user, ChatRoom room)
        {
            return _db.Entry(user)
                      .Collection(r => r.Rooms)
                      .Query()
                      .Where(r => r.Key == room.Key)
                      .Select(r => r.Name)
                      .FirstOrDefault() != null;
        }

        public void Reload(object entity)
        {
            _db.Entry(entity).Reload();
        }
    }
}