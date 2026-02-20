# Florida Trail AR: Critter Catch

This is a lightweight browser AR mini-game built with **A-Frame + AR.js**.

## Goal

- Catch glowing critters by tapping/clicking them in AR.
- You gain **+10** per catch and lose **-5** when a critter expires.
- Reach **120 points** before the timer ends.

## Run locally

Because camera APIs require a web context, run it through a local server:

```bash
cd /workspace
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/ar-game/`

## Marker

Use the default **Hiro marker** (print or display on another screen):

- https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/images/hiro.png

## Notes

- Works best on mobile Chrome/Safari and desktop Chrome.
- Allow camera permission when prompted.
