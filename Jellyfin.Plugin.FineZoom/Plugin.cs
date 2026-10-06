using Jellyfin.Plugin.FineZoom.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.FineZoom;

/// <summary>
/// Adds fine-grained video zoom controls to Jellyfin Web playback.
/// </summary>
public sealed class Plugin : BasePlugin<PluginConfiguration>
{
    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <inheritdoc />
    public override string Name => "Fine Zoom";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("4fdc5a27-f513-4ee5-878d-18ecd0184784");

    /// <summary>
    /// Gets the active plugin instance.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <summary>
    /// Builds the cache-busted client script element injected into Jellyfin Web.
    /// </summary>
    internal string BuildScriptTag()
    {
        string version = Version?.ToString() ?? "unknown";
        string cacheKey = version;
        try
        {
            string location = typeof(Plugin).Assembly.Location;
            if (!string.IsNullOrEmpty(location) && File.Exists(location))
            {
                cacheKey = $"{version}-{File.GetLastWriteTimeUtc(location).Ticks}";
            }
        }
        catch (IOException)
        {
            // A version-only key is sufficient when assembly metadata is unavailable.
        }

        return $"<script plugin=\"{Name}\" src=\"../FineZoom/script?v={cacheKey}\" defer></script>";
    }
}
