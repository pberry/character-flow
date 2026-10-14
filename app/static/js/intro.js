// The intro questionnaire: who is this character and what can they do?

import { h } from "./dom.js";
import { abilityModifier, formatModifier } from "./model.js";

const LISTS = [
  { key: "weapons", title: "Weapons & attacks", placeholder: "Longsword", notes: "+5 to hit, 1d8+3 slashing" },
  { key: "spells", title: "Spells & powers", placeholder: "Healing Word", notes: "Bonus action, 1d4+3" },
  { key: "features", title: "Features & abilities", placeholder: "Second Wind", notes: "Bonus action, 1/short rest" },
];

export function renderIntro(container, chartRecord, { onSave, onCancel }) {
  const character = structuredClone(chartRecord.data.character);

  const field = (label, input) => h("label", { class: "field" }, h("span", {}, label), input);
  const bind = (obj, key, attrs = {}) => {
    const input = h("input", { ...attrs, value: obj[key] ?? "" });
    input.addEventListener("input", () => {
      obj[key] = attrs.type === "number" ? Number(input.value) : input.value;
    });
    return input;
  };

  const abilitiesBox = h("div", { class: "rows" });
  function renderAbilities() {
    abilitiesBox.replaceChildren(
      ...character.abilities.map((ability, i) => {
        const mod = h("span", { class: "mod" }, formatModifier(abilityModifier(ability.score)));
        const score = bind(ability, "score", { type: "number", min: 1, max: 30, class: "score", "aria-label": "Score" });
        score.addEventListener("input", () => { mod.textContent = formatModifier(abilityModifier(ability.score)); });
        return h(
          "div",
          { class: "row ability-row" },
          bind(ability, "name", { class: "ability-name", "aria-label": "Ability name" }),
          score,
          mod,
          h("button", { type: "button", class: "btn icon", title: "Remove", onclick: () => { character.abilities.splice(i, 1); renderAbilities(); } }, "✕"),
        );
      }),
      h("button", { type: "button", class: "btn", onclick: () => { character.abilities.push({ name: "", score: 10 }); renderAbilities(); } }, "+ Add ability"),
    );
  }
  renderAbilities();

  const listSections = LISTS.map((spec) => {
    const box = h("div", { class: "rows" });
    const render = () => {
      const items = character[spec.key];
      box.replaceChildren(
        ...items.map((item, i) =>
          h(
            "div",
            { class: "row item-row" },
            bind(item, "name", { placeholder: spec.placeholder, "aria-label": "Name" }),
            bind(item, "notes", { placeholder: spec.notes, "aria-label": "Notes" }),
            h("button", { type: "button", class: "btn icon", title: "Remove", onclick: () => { items.splice(i, 1); render(); } }, "✕"),
          ),
        ),
        h("button", {
          type: "button",
          class: "btn",
          onclick: () => {
            items.push({ name: "", notes: "" });
            render();
            box.querySelectorAll(".item-row input")[items.length * 2 - 2]?.focus();
          },
        }, "+ Add"),
      );
    };
    if (!character[spec.key].length) character[spec.key].push({ name: "", notes: "" });
    render();
    return h("section", { class: "panel" }, h("h2", {}, spec.title), box);
  });

  const notes = h("textarea", { rows: 3, placeholder: "Tactics, personality, anything to remember in a fight" });
  notes.value = character.notes || "";
  notes.addEventListener("input", () => { character.notes = notes.value; });

  const error = h("p", { class: "error" });
  const form = h(
    "form",
    { class: "page intro" },
    h("h1", {}, "Tell me about your character"),
    h("p", { class: "lead" }, "These answers become cards in the sidebar of your flowchart. You can come back and change them any time."),
    h(
      "section",
      { class: "panel" },
      h("h2", {}, "Basics"),
      h(
        "div",
        { class: "grid3" },
        field("Character name", bind(character, "name", { placeholder: "Brakka Stonefist" })),
        field("Class / role", bind(character, "class", { placeholder: "Fighter" })),
        field("Level", bind(character, "level", { type: "number", min: 0, max: 30 })),
      ),
    ),
    h(
      "section",
      { class: "panel" },
      h("h2", {}, "Ability scores"),
      h("p", { class: "hint" }, "Modifiers are calculated for you. Rename, add, or remove rows to fit your game."),
      abilitiesBox,
    ),
    listSections,
    h("section", { class: "panel" }, h("h2", {}, "Notes"), notes),
    error,
    h(
      "div",
      { class: "actions" },
      h("button", { type: "button", class: "btn", onclick: onCancel }, "Cancel"),
      h("button", { type: "submit", class: "btn primary" }, "Save & open flowchart →"),
    ),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // Drop blank rows the player never filled in.
    for (const { key } of LISTS) character[key] = character[key].filter((i) => i.name.trim());
    character.abilities = character.abilities.filter((a) => a.name.trim());
    try {
      await onSave(character);
    } catch (err) {
      error.textContent = `Couldn't save: ${err.message}`;
    }
  });
  container.replaceChildren(form);
}
