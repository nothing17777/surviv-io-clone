import { isMobile } from "pixi.js-legacy";

function detectMobile() {
    // TEMP TEST OVERRIDE
    if (location.search.includes("forceTouch")) return true;
    return isMobile.android.device || isMobile.apple.device || isIpad();
}

function isIpad() {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes("ipad") || (ua.includes("macintosh") && "ontouchend" in document);
}

function detectiOS() {
    return isMobile.apple.phone || isMobile.apple.ipod;
}

function detectAndroid() {
    return isMobile.android.device;
}

function detectiPhoneX() {
    return (
        detectiOS()
        && ((screen.width == 375 && screen.height == 812)
            || (screen.height == 375 && screen.width == 812)
            || (screen.width == 414 && screen.height == 896)
            || (screen.height == 414 && screen.width == 896))
    );
}

function getOs() {
    if (detectiOS()) return "ios";
    if (detectAndroid()) return "android";
    return "pc";
}

class Device {
    readonly UiLayout = {
        Lg: 0,
        Sm: 1,
    };

    readonly os = getOs();
    readonly model = detectiPhoneX() ? "iphonex" : "unknown";

    readonly mobile = detectMobile();
    readonly tablet = isMobile.tablet || isIpad();
    readonly touch = this.mobile || this.tablet;

    uiLayout = this.mobile ? this.UiLayout.Sm : this.UiLayout.Lg;
    pixelRatio = window.devicePixelRatio;
    isLandscape = true;

    screenWidth = 0;
    screenHeight = 0;

    constructor() {
        this.onResize();
    }

    onResize() {
        // On iOS Safari window.innerHeight includes the strip hidden behind the
        // browser bars, so the canvas ends up taller than what you can see and
        // the bottom of the HUD is unreachable. The visual viewport is the part
        // actually on screen.
        const visual = this.touch ? window.visualViewport : null;
        this.screenWidth = Math.round(visual?.width ?? window.innerWidth);

        const visualHeight = Math.round(visual?.height ?? window.innerHeight);
        // The on screen keyboard also shrinks the visual viewport; that is not
        // the game getting smaller, so ignore anything that drastic.
        this.screenHeight = visualHeight < window.innerHeight * 0.7
            ? window.innerHeight
            : visualHeight;

        this.isLandscape = window.innerWidth > window.innerHeight;

        const layoutDim = this.isLandscape ? this.screenWidth : this.screenHeight;
        this.uiLayout = this.mobile || layoutDim <= 1000
            ? this.UiLayout.Sm
            : this.UiLayout.Lg;

        this.refreshDocumentState();
    }

    // Mirror the layout state onto <html> so the stylesheets can react to
    // UA-detected phones that are too wide for the width based media queries,
    // and expose the real visible height (iOS Safari shrinks it with its bars).
    refreshDocumentState() {
        const root = document.documentElement;
        if (!root) return;

        root.classList.toggle("device-touch", this.touch);
        root.classList.toggle("device-mobile", this.uiLayout == this.UiLayout.Sm);
        root.classList.toggle("device-portrait", !this.isLandscape);

        root.style.setProperty("--app-height", `${this.screenHeight}px`);
    }
}

export const device = new Device();
