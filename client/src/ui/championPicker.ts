import $ from "jquery";
import { ChampionDefs, ChampionIds } from "../../../shared/defs/gameObjects/championDefs.ts";

/**
 * The searchable icon grid for picking a League champion kit, opened from a "Browse Champions"
 * button next to any kit <select> (main menu, party, duel bot pickers). Lets players find one of
 * 170+ champions by name instead of scrolling a giant dropdown.
 */
let overlay: JQuery<HTMLElement> | undefined;
let grid: JQuery<HTMLElement> | undefined;
let search: JQuery<HTMLElement> | undefined;
let boundSelect: JQuery<HTMLElement> | undefined;

const champions = ChampionIds.map((id) => ({ id, name: ChampionDefs[id].name }))
    .sort((a, b) => a.name.localeCompare(b.name));

function ensureOverlay() {
    if (overlay) return;
    overlay = $("<div>", { id: "champ-picker-overlay" }).appendTo("body").hide();
    const box = $("<div>", { class: "champ-picker-box" }).appendTo(overlay);
    const head = $("<div>", { class: "champ-picker-head" }).appendTo(box);
    search = $("<input>", { type: "text", placeholder: "Search champions..." }).appendTo(head);
    $("<span>", { class: "champ-picker-close", text: "✕" }).appendTo(head).on("click", closePicker);
    grid = $("<div>", { class: "champ-picker-grid" }).appendTo(box);

    search.on("input", renderGrid);
    overlay.on("click", (e) => {
        if (e.target === overlay![0]) closePicker();
    });
    $(document).on("keydown.champPicker", (e) => {
        if (e.key === "Escape" && overlay!.is(":visible")) closePicker();
    });
}

function renderGrid() {
    const q = (search!.val() as string).trim().toLowerCase();
    const matches = q ? champions.filter((c) => c.name.toLowerCase().includes(q)) : champions;
    grid!.empty();
    if (!matches.length) {
        $("<div>", { class: "champ-picker-empty", text: "No champions match." }).appendTo(grid!);
        return;
    }
    const current = boundSelect?.val();
    for (const c of matches) {
        const item = $("<div>", { class: "champ-picker-item" }).toggleClass("selected", c.id === current);
        $("<img>", { src: `img/champions/icons/${c.id}.png`, alt: c.name }).appendTo(item);
        $("<span>", { text: c.name }).appendTo(item);
        item.on("click", () => {
            boundSelect?.val(c.id).trigger("change");
            closePicker();
        });
        grid!.append(item);
    }
}

function closePicker() {
    overlay?.hide();
    boundSelect = undefined;
}

export function openChampionPicker(sel: JQuery<HTMLElement>) {
    ensureOverlay();
    boundSelect = sel;
    search!.val("");
    overlay!.show();
    renderGrid();
    search!.trigger("focus");
}
