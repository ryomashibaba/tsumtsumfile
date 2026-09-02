import {
  CHEAT_SPECIAL,
  displaySettingValue,
  getSkillCostKey,
  settingValueFromSlider
} from "./cheatSettings.js?v=cheat-settings-2";

function element(tag, className, text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export class CheatSettingsPanel {
  constructor(game, host = document.body) {
    this.game = game;
    this.host = host;
    this.dialog = element("dialog", "cheat-dialog");
    this.dialog.setAttribute("aria-labelledby", "cheatDialogTitle");
    this.dialog.setAttribute("autocomplete", "off");
    this.host.appendChild(this.dialog);
    this.game.onCheatSettingsRequested = () => this.open();
  }

  open() {
    if (!this.game.isCheatActive()) return;
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }

  createValueControl({ label, value, specialValue, specialLabel, defaultLabel, onChange }) {
    const group = element("fieldset", "cheat-control");
    const legend = element("legend", "cheat-control__legend", label);
    group.appendChild(legend);

    const slider = element("input", "cheat-control__range");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1000";
    slider.step = "1";
    slider.value = String(displaySettingValue(value, specialValue));
    slider.setAttribute("aria-label", `${label} スライダー`);

    const row = element("div", "cheat-control__row");
    const number = element("input", "cheat-control__number");
    number.type = "number";
    number.autocomplete = "off";
    number.min = "0";
    number.max = "999";
    number.step = "1";
    number.inputMode = "numeric";
    number.value = value === specialValue ? "" : String(value);
    number.placeholder = value === specialValue ? specialLabel : "0～999";
    number.setAttribute("aria-label", `${label} 数値`);
    const special = element("button", "cheat-special-button", specialLabel);
    special.type = "button";
    special.setAttribute("aria-pressed", String(value === specialValue));

    const commit = (nextValue) => {
      slider.value = String(displaySettingValue(nextValue, specialValue));
      number.value = nextValue === specialValue ? "" : String(nextValue);
      number.placeholder = nextValue === specialValue ? specialLabel : "0～999";
      special.setAttribute("aria-pressed", String(nextValue === specialValue));
      onChange(nextValue);
    };
    slider.addEventListener("input", () => commit(settingValueFromSlider(slider.value, specialValue)));
    number.addEventListener("input", () => {
      const next = Math.max(0, Math.min(999, Math.round(Number(number.value) || 0)));
      commit(next);
    });
    special.addEventListener("click", () => commit(specialValue));

    row.append(number, special);
    group.append(slider, row);
    if (defaultLabel) group.appendChild(element("div", "cheat-control__hint", defaultLabel));
    return group;
  }

  createNumericRangeControl({ label, value, min, max, step, suffix = "", defaultLabel, onChange }) {
    const group = element("fieldset", "cheat-control");
    group.appendChild(element("legend", "cheat-control__legend", label));
    const slider = element("input", "cheat-control__range");
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.setAttribute("aria-label", `${label} スライダー`);
    const row = element("div", "cheat-control__row");
    const number = element("input", "cheat-control__number");
    number.type = "number";
    number.min = String(min);
    number.max = String(max);
    number.step = String(step);
    number.value = String(value);
    number.setAttribute("aria-label", `${label} 数値`);
    const unit = element("span", "cheat-control__unit", suffix);
    const commit = (raw) => {
      const next = Math.max(min, Math.min(max, Number(raw) || min));
      slider.value = String(next);
      number.value = String(next);
      onChange(next);
    };
    slider.addEventListener("input", () => commit(slider.value));
    number.addEventListener("input", () => commit(number.value));
    row.append(number, unit);
    group.append(slider, row);
    if (defaultLabel) group.appendChild(element("div", "cheat-control__hint", defaultLabel));
    return group;
  }

  createCoinControl({ label, value, defaultValue, hint, onChange }) {
    const group = element("fieldset", "cheat-control cheat-control--coin");
    group.appendChild(element("legend", "cheat-control__legend", label));
    const row = element("div", "cheat-control__row");
    const number = element("input", "cheat-control__number");
    number.type = "number";
    number.min = "-999";
    number.max = "999";
    number.step = "1";
    number.value = String(value);
    number.setAttribute("aria-label", `${label} コイン補正`);
    number.addEventListener("input", () => onChange(Math.max(-999, Math.min(999, Math.round(Number(number.value) || 0)))));
    row.append(number, element("span", "cheat-control__unit", "コイン補正"));
    group.appendChild(row);
    group.appendChild(element("div", "cheat-control__hint", hint || `現在Lvの初期値 ${defaultValue}`));
    return group;
  }

  getDisplayedSkillCost(characterId, pairMode, defaultCost) {
    const key = getSkillCostKey(characterId, pairMode);
    const costs = this.game.cheatSettings.skillCosts || {};
    return Object.prototype.hasOwnProperty.call(costs, key) ? costs[key] : defaultCost;
  }

  render() {
    this.dialog.replaceChildren();
    const header = element("div", "cheat-dialog__header");
    const titleWrap = element("div", "cheat-dialog__title-wrap");
    const title = element("h2", "cheat-dialog__title", "チート設定");
    title.id = "cheatDialogTitle";
    titleWrap.append(title, element("p", "cheat-dialog__subtitle", this.game.myTsum?.name || "選択中のツム"));
    const close = element("button", "cheat-dialog__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "チート設定を閉じる");
    close.addEventListener("click", () => this.close());
    header.append(titleWrap, close);

    const body = element("div", "cheat-dialog__body");
    body.appendChild(this.createValueControl({
      label: "盤面ツム数",
      value: this.game.cheatSettings.boardTarget,
      specialValue: CHEAT_SPECIAL.UNLIMITED,
      specialLabel: "制限なし",
      defaultLabel: "左端 0・右端直前 999・初期値 45",
      onChange: (boardTarget) => this.game.updateCheatSettings({ boardTarget })
    }));
    body.appendChild(this.createNumericRangeControl({
      label: "大ツム出現率",
      value: this.game.cheatSettings.largeTsumChance,
      min: 0,
      max: 100,
      step: 1,
      suffix: "%",
      defaultLabel: "初期値 1%",
      onChange: (largeTsumChance) => this.game.updateCheatSettings({ largeTsumChance })
    }));
    body.appendChild(this.createNumericRangeControl({
      label: "重力",
      value: this.game.cheatSettings.gravityMultiplier,
      min: 0.1,
      max: 10,
      step: 0.1,
      suffix: "倍",
      defaultLabel: "初期値 1倍",
      onChange: (gravityMultiplier) => this.game.updateCheatSettings({ gravityMultiplier })
    }));
    body.appendChild(this.createValueControl({
      label: "ツム出現スピード",
      value: this.game.cheatSettings.spawnRate,
      specialValue: CHEAT_SPECIAL.INSTANT,
      specialLabel: "即時",
      defaultLabel: "0～999個/秒・制限なし盤面の即時は999個/秒",
      onChange: (spawnRate) => this.game.updateCheatSettings({ spawnRate })
    }));

    const characterId = this.game.myTsum?.id || "";
    const defaultCost = this.game.getDefaultSkillCost(characterId);
    if (characterId === "judyNick") {
      for (const [mode, label] of [["judy", "ジュディ 必要数"], ["nick", "ニック 必要数"]]) {
        body.appendChild(this.createValueControl({
          label,
          value: this.getDisplayedSkillCost(characterId, mode, defaultCost),
          specialValue: CHEAT_SPECIAL.UNLIMITED,
          specialLabel: "制限なし",
          defaultLabel: `現在Lvの初期値 ${defaultCost}`,
          onChange: (value) => this.game.setCheatSkillCost(characterId, mode, value)
        }));
      }
    } else {
      body.appendChild(this.createValueControl({
        label: "スキル発動必要数",
        value: this.getDisplayedSkillCost(characterId, null, defaultCost),
        specialValue: CHEAT_SPECIAL.UNLIMITED,
        specialLabel: "制限なし",
        defaultLabel: `現在Lvの初期値 ${defaultCost}`,
        onChange: (value) => this.game.setCheatSkillCost(characterId, null, value)
      }));
    }


    const normalKey = `${characterId}:normal:default`;
    body.appendChild(this.createCoinControl({
      label: "スキル外のコイン補正",
      value: this.game.cheatSettings.coinCorrections?.[normalKey] ?? 0,
      defaultValue: 0,
      onChange: (value) => this.game.setCheatCoinCorrection(characterId, "normal", "default", value)
    }));
    for (const control of this.game.getCoinCorrectionControls()) {
      const key = `${characterId}:skill:${control.route}`;
      body.appendChild(this.createCoinControl({
        label: control.label,
        value: this.game.cheatSettings.coinCorrections?.[key] ?? control.defaultValue,
        defaultValue: control.defaultValue,
        hint: control.hint,
        onChange: (value) => this.game.setCheatCoinCorrection(characterId, "skill", control.route, value)
      }));
    }

    const autoRow = element("label", "cheat-auto-row");
    const auto = element("input", "cheat-auto-row__input");
    auto.type = "checkbox";
    auto.autocomplete = "off";
    auto.checked = this.game.cheatSettings.autoSkill === true;
    const updateAutoSkill = () => this.game.updateCheatSettings({ autoSkill: auto.checked });
    auto.addEventListener("input", updateAutoSkill);
    auto.addEventListener("change", updateAutoSkill);
    auto.addEventListener("click", () => queueMicrotask(updateAutoSkill));
    const autoCopy = element("span", "cheat-auto-row__copy");
    autoCopy.append(
      element("strong", "", "自動スキル発動"),
      element("small", "", "発動可能になった最初の瞬間に使用")
    );
    autoRow.append(auto, autoCopy);
    body.appendChild(autoRow);

    const footer = element("div", "cheat-dialog__footer");
    const reset = element("button", "cheat-reset-button", "初期値に戻す");
    reset.type = "button";
    reset.addEventListener("click", () => {
      this.game.resetCheatSettings();
      this.close();
    });
    const done = element("button", "cheat-done-button", "完了");
    done.type = "button";
    done.addEventListener("click", () => this.close());
    footer.append(reset, done);
    this.dialog.append(header, body, footer);
  }
}
