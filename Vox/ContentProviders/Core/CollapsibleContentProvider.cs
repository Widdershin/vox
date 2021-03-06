﻿using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Security.Application;
using JabbR.Services;

namespace JabbR.ContentProviders.Core
{
    public abstract class CollapsibleContentProvider : IContentProvider
    {
        private string[] _boxClasses = new [] { "collapsible_box" };

        public virtual string[] BoxClasses
        {
            get { return _boxClasses; }
            set { _boxClasses = value; }
        }

        public virtual Task<ContentProviderResult> GetContent(ContentProviderHttpRequest request)
        {
            return GetCollapsibleContent(request).Then(result => ProcessResult(result));
        }

        public virtual Task<ContentProviderResult> GetContent(ContentProviderHttpRequest request, Match match)
        {
            return GetCollapsibleContent(request, match).Then(result => ProcessResult(result));
        }

        protected ContentProviderResult ProcessResult(ContentProviderResult result)
        {
            if (IsCollapsible && result != null)
            {
                string contentTitle = String.Format(LanguageResources.Content_HeaderAndToggle, Encoder.HtmlEncode(result.Title));
                result.Content = String.Format(ContentFormat, contentTitle, string.Join(" ", BoxClasses), result.Content);
            }

            return result;
        }

        protected virtual Regex ParameterExtractionRegex
        {
            get
            {
                return new Regex(@"(\d+)");

            }
        }

        protected virtual IList<string> ExtractParameters(Uri responseUri)
        {
            return ParameterExtractionRegex.Match(responseUri.AbsoluteUri)
                                .Groups
                                .Cast<Group>()
                                .Skip(1)
                                .Select(g => g.Value)
                                .Where(v => !String.IsNullOrEmpty(v)).ToList();

        }

        protected virtual Task<ContentProviderResult> GetCollapsibleContent(ContentProviderHttpRequest request)
        {
            throw new NotImplementedException();
        }

        protected virtual Task<ContentProviderResult> GetCollapsibleContent(ContentProviderHttpRequest request, Match match)
        {
            throw new NotImplementedException();
        }

        public virtual bool IsValidContent(Uri uri)
        {
            return false;
        }

        public virtual Match Match(Uri uri)
        {
            return null;
        }

        protected virtual bool IsCollapsible { get { return true; } }

        public IJabbrRepository Repository { get; set; }

        private const string ContentFormat = @"<div class=""collapsible_content""><h3 class=""collapsible_title"">{0}</h3><div class=""{1}"">{2}</div></div>";
    }
}