# Fine Zoom for Jellyfin

Fine Zoom adds a 100-200% video zoom slider with 1% steps to Jellyfin Web. It is
designed for ultrawide displays and videos that contain hard-coded black bars.

The control appears beside Jellyfin's playback settings button. Zoom preserves
the picture's proportions, includes one-percent decrease/increase buttons and a
reset button, and remembers the selected value for each video on that browser.

## Compatibility

- Jellyfin Server 12.0
- Browsers and clients based on Jellyfin Web

Fine Zoom cannot affect independently implemented native video players. Native
or bitmap subtitles may scale with the video and can be cropped at high zoom
levels; client-rendered text subtitles remain in place.

## Installation

Copy `Jellyfin.Plugin.FineZoom.dll` and `BINARY-LICENSE` into a
`Fine Zoom_1.0.0.0` directory beneath Jellyfin's plugins directory, then
restart Jellyfin. Reload Jellyfin Web without using its cached page after
installing or upgrading.

## Technical note

Jellyfin does not currently provide a supported server-plugin extension point
for playback controls. Fine Zoom injects its embedded client component into the
Jellyfin Web shell at request time and does not modify Jellyfin Web files on
disk. A Jellyfin Web update may therefore require an update to this plugin.

## Building

```sh
dotnet publish Jellyfin.Plugin.FineZoom/Jellyfin.Plugin.FineZoom.csproj \
  --configuration Release \
  --output artifacts/publish
```

## License

The original source code is available under the MIT License. Distributed
plugin binaries link against Jellyfin's GPLv3 libraries and are distributed
under GPLv3; see `BINARY-LICENSE`.
