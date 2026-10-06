using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.FineZoom.Controllers;

/// <summary>
/// Serves the embedded Fine Zoom client component.
/// </summary>
[ApiController]
[Route("FineZoom")]
public sealed class FineZoomController : ControllerBase
{
    /// <summary>
    /// Returns the embedded Jellyfin Web component.
    /// </summary>
    [HttpGet("script")]
    [AllowAnonymous]
    [ResponseCache(Duration = 31_536_000, Location = ResponseCacheLocation.Any)]
    public IActionResult GetScript()
    {
        Stream? stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("Jellyfin.Plugin.FineZoom.Web.fine-zoom.js");
        return stream is null ? NotFound() : File(stream, "application/javascript; charset=utf-8");
    }
}
