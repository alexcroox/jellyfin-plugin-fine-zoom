using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.FineZoom.Services;

/// <summary>
/// Adds the embedded Fine Zoom script to the Jellyfin Web application shell.
/// </summary>
public sealed class ScriptInjectionStartupFilter : IStartupFilter
{
    private static readonly string[] WebShellPaths = ["/web", "/web/", "/web/index.html"];

    private readonly ILogger<ScriptInjectionStartupFilter> _logger;
    private int _hasLogged;

    /// <summary>
    /// Initializes a new instance of the <see cref="ScriptInjectionStartupFilter"/> class.
    /// </summary>
    public ScriptInjectionStartupFilter(ILogger<ScriptInjectionStartupFilter> logger)
    {
        _logger = logger;
    }

    /// <inheritdoc />
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return application =>
        {
            application.Use(DecorateWebShellAsync);
            next(application);
        };
    }

    private async Task DecorateWebShellAsync(HttpContext context, Func<Task> continuePipeline)
    {
        if (!ShouldDecorate(context.Request))
        {
            await continuePipeline().ConfigureAwait(false);
            return;
        }

        PrepareRequest(context.Request);

        HttpResponse response = context.Response;
        Stream clientStream = response.Body;
        await using MemoryStream capturedResponse = new();
        response.Body = capturedResponse;

        try
        {
            await continuePipeline().ConfigureAwait(false);
        }
        catch
        {
            response.Body = clientStream;
            throw;
        }

        response.Body = clientStream;
        capturedResponse.Position = 0;

        if (!IsHtmlDocument(response))
        {
            await capturedResponse.CopyToAsync(clientStream).ConfigureAwait(false);
            return;
        }

        byte[] originalBytes = capturedResponse.ToArray();
        byte[] outputBytes = TryAddScript(originalBytes) ?? originalBytes;
        if (!ReferenceEquals(outputBytes, originalBytes))
        {
            ResetRepresentationHeaders(response, outputBytes.Length);
        }

        await clientStream.WriteAsync(outputBytes).ConfigureAwait(false);
    }

    private byte[]? TryAddScript(byte[] originalBytes)
    {
        try
        {
            string document = Encoding.UTF8.GetString(originalBytes);
            if (document.Contains("/FineZoom/script", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            int insertionPoint = document.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
            string? scriptTag = Plugin.Instance?.BuildScriptTag();
            if (insertionPoint < 0 || string.IsNullOrEmpty(scriptTag))
            {
                return null;
            }

            string decoratedDocument = document.Insert(insertionPoint, scriptTag + Environment.NewLine);
            if (Interlocked.Exchange(ref _hasLogged, 1) == 0)
            {
                _logger.LogInformation("Fine Zoom client script injected into Jellyfin Web.");
            }

            return Encoding.UTF8.GetBytes(decoratedDocument);
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "Fine Zoom could not decorate the Jellyfin Web shell.");
            return null;
        }
    }

    private static bool ShouldDecorate(HttpRequest request)
    {
        if (!HttpMethods.IsGet(request.Method))
        {
            return false;
        }

        string path = request.Path.Value ?? string.Empty;
        return WebShellPaths.Any(candidate => path.EndsWith(candidate, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsHtmlDocument(HttpResponse response)
    {
        return response.StatusCode == StatusCodes.Status200OK
            && response.ContentType?.Contains("text/html", StringComparison.OrdinalIgnoreCase) == true;
    }

    private static void PrepareRequest(HttpRequest request)
    {
        request.Headers.Remove("Accept-Encoding");
        request.Headers.Remove("Range");
        request.Headers.Remove("If-Range");
    }

    private static void ResetRepresentationHeaders(HttpResponse response, int contentLength)
    {
        response.ContentType = "text/html; charset=utf-8";
        response.ContentLength = contentLength;
        response.Headers.Remove("ETag");
        response.Headers.Remove("Last-Modified");
        response.Headers.Remove("Accept-Ranges");
    }
}
