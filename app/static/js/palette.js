// Sidebar: character summary plus draggable cards built from the questionnaire.

import { h } from "./dom.js";
import { abilityModifier, formatModifier, paletteGroups } from "./model.js";

export function characterSummary(character) {
  const subtitle = [character.class, character.level ? `Level ${character.level}` : ""].filter(Boolean).join(" · ");
  return h(
    "div",
    { class: "summary" },
    h("div", { class: "summary-name" }, character.name || "Unnamed character"),
    subtitle ? h("div", { class: "summary-sub" }, subtitle) : null,
    h(
      "div",
      { class: "abilities" },
      character.abilities
        .filter((a) => a.name)
        .map((a) =>
          h("span", { class: "ability" }, h("b", {}, a.name), " ", formatModifier(abilityModifier(a.score)), h("small", {}, ` (${a.score})`)),
        ),
    ),
  );
}

export function renderPalette(container, character, onAdd) {
  container.replaceChildren(
    characterSummary(character),
    h("p", { class: "hint" }, "Drag a card onto the canvas, or click it to add next to the selected box."),
    ...paletteGroups(character).map((group) =>
      h(
        "section",
        { class: "palette-group" },
        h("h3", {}, group.title),
        group.items.map((item) => {
          const card = h(
            "div",
            { class: "card", draggable: "true", style: { background: item.color }, title: item.text || item.label },
            item.label,
          );
          card.addEventListener("dragstart", (e) => {
            const payload = JSON.stringify({ text: item.text, color: item.color });
            e.dataTransfer.setData("application/x-charflow", payload);
            e.dataTransfer.setData("text/plain", payload);
            e.dataTransfer.effectAllowed = "copy";
          });
          card.addEventListener("click", () => onAdd(item));
          return card;
        }),
      ),
    ),
  );
}
