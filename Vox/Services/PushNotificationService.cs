﻿using JabbR.Infrastructure;
using JabbR.Models;
using Microsoft.Ajax.Utilities;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;

namespace JabbR.Services
{
    public class PushNotificationService
    {
        private readonly HttpClient _httpClient;
        private readonly ApplicationSettings _settings;
        private readonly ILogger _logger;

        public PushNotificationService(ApplicationSettings settings, ILogger logger)
        {
            _httpClient = new HttpClient();
            _settings = settings;
            _logger = logger;
        }

        public void SendAsync(Notification notification)
        {
            if (notification.Read) return;

            SendAsync(notification.User, notification.Message);
        }

        public void SendAsync(ChatUser user, ChatMessage message)
        {
            Task.Run(() => Send(user, message));
        }

        public void Send(ChatUser user, ChatMessage message)
        {
            if (user.Preferences == null || user.Preferences.PushNotifications == null)
                return;

            _logger.Log("Send user: {0}, message: {1}", user.Id, message.Id);

            try
            {
                NotifyMyAndroid(user, message);
                Pushover(user, message);
                Pushbullet(user, message);
            }
            catch (Exception ex)
            {
                _logger.Log("Send error: {0}", ex.ToString());
            }
        }

        private string GetTitle(ChatMessage message, int lengthLimit = 0)
        {
            var title = string.Format("Message from {0} in #{1}", message.User.Name, message.Room.Name);

            if (lengthLimit > 0 && title.Length > lengthLimit)
                title = title.Substring(0, lengthLimit - 3) + "...";

            return title;
        }

        private async void NotifyMyAndroid(ChatUser user, ChatMessage message)
        {
            var preferences = user.Preferences.PushNotifications.NMA;

            // Check preferences validity
            if (preferences == null || !preferences.Enabled || preferences.APIKey == null)
                return;

            var apikey = preferences.APIKey.Replace(" ", "");
            if (apikey.Length != 48)
                return;

            // Create event and description content values and add ellipsis if over limits

            var descriptionContent = message.Content;
            if (descriptionContent.Length > 10000)
                descriptionContent = descriptionContent.Substring(0, 10000 - 3) + "...";

            var request = new Dictionary<string, string>
            {
                {"apikey", apikey},
                {"application", "vox"},
                {"event", GetTitle(message, 100)},
                {"description", descriptionContent}
            };

            var result = await _httpClient.PostAsync("https://www.notifymyandroid.com/publicapi/notify", new FormUrlEncodedContent(request));

            _logger.Log("Send NotifyMyAndroid: {0}", result.StatusCode);
        }

        private async void Pushover(ChatUser user, ChatMessage message)
        {
            if (_settings.PushoverAPIKey.IsNullOrWhiteSpace())
                return;

            // Check preferences validity
            var preferences = user.Preferences.PushNotifications.Pushover;

            if (preferences == null || !preferences.Enabled || preferences.UserKey.IsNullOrWhiteSpace())
                return;

            var request = new Dictionary<string, string>
            {
                {"token", _settings.PushoverAPIKey},
                {"user", preferences.UserKey},
                {"title", GetTitle(message)},
                {"message", message.Content}
            };

            if (!preferences.DeviceName.IsNullOrWhiteSpace())
                request["device"] = preferences.DeviceName;

            var result = await _httpClient.PostAsync("https://api.pushover.net/1/messages.json", new FormUrlEncodedContent(request));

            _logger.Log("Send Pushover: {0}", result.StatusCode);
        }

        private async void Pushbullet(ChatUser user, ChatMessage message)
        {
            // Check preferences validity
            var preferences = user.Preferences.PushNotifications.Pushbullet;

            if (preferences == null || !preferences.Enabled || preferences.APIKey.IsNullOrWhiteSpace())
                return;

            // Get a list of all devices for user from pushbullet
            var devices = await PushbulletRequest(preferences.APIKey, "devices", HttpMethod.Get);

            if (devices.Item1.StatusCode != HttpStatusCode.OK)
            {
                _logger.Log("Pushbullet /api/devices request failed, StatusCode: {0}", devices.Item1.StatusCode);
                return;
            }

            var deviceIdentifiers = devices.Item2["devices"]
                .Select(d =>
                {
                    var name = d["extras"]["nickname"].Value<string>();

                    if (name.Length < 1)
                        name = d["extras"]["model"].Value<string>();

                    return new Tuple<string, string>(d["id"].Value<string>(), name);
                })
                .ToList();

            // Filter devices from stored names
            if (!preferences.Devices.IsNullOrWhiteSpace())
            {
                // Parse devices from input
                var names = PushbulletParseDevices(preferences.Devices).ToList();

                // Filter devices based on names
                deviceIdentifiers = deviceIdentifiers.Where(d => names.Contains(d.Item2)).ToList();
            }

            foreach (var device in deviceIdentifiers)
            {
                var request = new Dictionary<string, string>
                {
                    {"device_id", device.Item1},
                    {"type", "note"},
                    {"title", GetTitle(message)},
                    {"body", message.Content}
                };

                var result = await PushbulletRequest(preferences.APIKey, "pushes", HttpMethod.Post, request);

                _logger.Log("Send Pushbullet: {0}", result.Item1.StatusCode);
            }
        }

        private IEnumerable<string> PushbulletParseDevices(string devicesString)
        {
            return devicesString.Split(',').Select(s => s.Trim()).Where(s => s.Length > 0);
        }

        private Task<Tuple<HttpResponseMessage, JObject>> PushbulletRequest(string apiKey, string method, HttpMethod httpMethod, Dictionary<string, string> request = null)
        {
            var message = new HttpRequestMessage(httpMethod, string.Format("https://api.pushbullet.com/api/{0}", method));

            var auth = System.Text.Encoding.ASCII.GetBytes(string.Format("{0}:", apiKey));
            message.Headers.Add("Authorization", "Basic " + Convert.ToBase64String(auth));

            if (request != null)
                message.Content = new FormUrlEncodedContent(request);

            return _httpClient.SendAsync(message).Then(response =>
                response.Content.ReadAsStringAsync().Then(s =>
                    new Tuple<HttpResponseMessage, JObject>(response, JObject.Parse(s))));
        }
    }
}