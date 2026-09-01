function showBootError(message, detail = "") {
  const existing = document.getElementById("bootError");
  if (existing) {
    existing.remove();
  }

  const canvas = document.getElementById("gameCanvas");
  if (canvas) {
    canvas.style.display = "none";
  }

  const overlay = document.createElement("div");
  overlay.id = "bootError";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.display = "grid";
  overlay.style.placeItems = "center";
  overlay.style.padding = "24px";
  overlay.style.background = "linear-gradient(180deg, #0b3452 0%, #10233f 100%)";
  overlay.style.color = "#ffffff";
  overlay.style.fontFamily = '"Trebuchet MS", sans-serif';
  overlay.style.zIndex = "9999";

  const panel = document.createElement("div");
  panel.style.width = "min(520px, 100%)";
  panel.style.padding = "24px";
  panel.style.borderRadius = "18px";
  panel.style.background = "rgba(10, 19, 37, 0.84)";
  panel.style.border = "1px solid rgba(255,255,255,0.16)";
  panel.style.boxShadow = "0 18px 40px rgba(0,0,0,0.28)";

  const title = document.createElement("h1");
  title.textContent = "TsumTsum failed to start";
  title.style.margin = "0 0 12px";
  title.style.fontSize = "24px";

  const body = document.createElement("p");
  body.textContent = message;
  body.style.margin = "0 0 12px";
  body.style.lineHeight = "1.6";

  panel.appendChild(title);
  panel.appendChild(body);

  if (detail) {
    const detailLabel = document.createElement("p");
    detailLabel.textContent = "Details";
    detailLabel.style.margin = "16px 0 8px";
    detailLabel.style.opacity = "0.82";
    detailLabel.style.fontSize = "13px";

    const detailBox = document.createElement("pre");
    detailBox.textContent = detail;
    detailBox.style.margin = "0";
    detailBox.style.padding = "14px";
    detailBox.style.borderRadius = "12px";
    detailBox.style.background = "rgba(255,255,255,0.08)";
    detailBox.style.whiteSpace = "pre-wrap";
    detailBox.style.wordBreak = "break-word";
    detailBox.style.fontFamily = 'Consolas, "Courier New", monospace';
    detailBox.style.fontSize = "12px";

    panel.appendChild(detailLabel);
    panel.appendChild(detailBox);
  }

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

async function bootGame() {
  const canvas = document.getElementById("gameCanvas");
  const cpuCanvas = document.getElementById("cpuCanvas");
  const arena = document.getElementById("gameArena");
  if (!canvas || !cpuCanvas || !arena) {
    throw new Error("One or more game canvas elements were not found.");
  }

  const params = new URLSearchParams(window.location.search);
  const requestedLargeTsumChance = params.has("largeTsumChance")
    ? Number(params.get("largeTsumChance"))
    : undefined;
  const largeTsumSpawnChance = Number.isFinite(requestedLargeTsumChance)
    ? Math.max(0, Math.min(1, requestedLargeTsumChance))
    : undefined;
  const debugImport = params.get("coronationElsaDebug") === "1" || params.get("coronationElsaPerf") === "1" || params.get("liliaDebug") === "1";
  const gameModuleUrl = debugImport
    ? `./game.js?t=${encodeURIComponent(params.get("t") || Date.now())}`
    : "./game.js?v=coronation-elsa-planner-perf-1";
  const { Game } = await import(gameModuleUrl);
  const { BattleController } = await import("./battle.js?v=tsum-images-5");
  const game = new Game(canvas, {
    role: "player",
    inputEnabled: true,
    persistenceEnabled: true,
    managedLoop: true,
    largeTsumSpawnChance
  });
  const createCpuGame = () => {
    const cpuGame = new Game(cpuCanvas, {
      role: "cpu",
      inputEnabled: false,
      persistenceEnabled: false,
      managedLoop: true,
      largeTsumSpawnChance
    });
    window.cpuGame = cpuGame;
    return cpuGame;
  };
  const battleController = new BattleController(game, null, arena, { createCpuGame });
  window.game = game;
  window.cpuGame = null;
  window.battleController = battleController;
  game.render();
  const bootStatus = document.getElementById("bootStatus");
  if (bootStatus) {
    bootStatus.hidden = true;
  }
  battleController.start();
}

function startBoot() {
  void bootGame().catch((error) => {
    console.error("[TsumTsum boot]", error);
    showBootError(
      "Startup stopped while loading modules or creating the game. Check the file layout and reload the browser.",
      error instanceof Error ? error.message : String(error)
    );
  });
}

// This module is at the end of <body>, so the required DOM is already available.
// Do not wait for the window "load" event: slow CSS, icons, or images must not
// hold up module loading and the first canvas frame.
startBoot();

window.addEventListener("unhandledrejection", (event) => {
  console.error("[TsumTsum unhandledrejection]", event.reason);
});

window.addEventListener("error", (event) => {
  if (!event.error) {
    return;
  }
  console.error("[TsumTsum error]", event.error);
});
