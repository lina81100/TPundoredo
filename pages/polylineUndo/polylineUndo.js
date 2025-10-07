import Stack from './stack';
import Konva from "konva";
import { createMachine, interpret } from "xstate";

class Command {
    execute() {}
    undo() {}
}

class AddLineCommand extends Command {
    constructor(line, layer) {
        super();
        this.line = line;
        this.layer = layer;
    }
    execute() {
        this.layer.add(this.line);
        this.layer.draw();
    }
    undo() {
        this.line.remove();
        this.layer.draw();
    }
}

// Commande concrète pour changer la couleur d'une polyline
class ChangeColorCommand extends Command {
    constructor(line, newColor) {
        super();
        this.line = line;
        this.newColor = newColor;
        this.oldColor = line.stroke();
    }
    execute() {
        this.line.stroke(this.newColor);
        this.line.getLayer().draw();
    }
    undo() {
        this.line.stroke(this.oldColor);
        this.line.getLayer().draw();
    }
}

class UndoManager {
    constructor() {
        this.undoStack = new Stack();
        this.redoStack = new Stack();
        this.updateButtons(); // Met à jour l'état des boutons au démarrage
    }

    executeCmd(cmd) {
        cmd.execute();
        this.undoStack.push(cmd);
        this.redoStack.clear();
        this.updateButtons();
    }

    undo() {
        if (!this.undoStack.isEmpty()) {
            const cmd = this.undoStack.pop();
            cmd.undo();
            this.redoStack.push(cmd);
            this.updateButtons();
        }
    }

    redo() {
        if (!this.redoStack.isEmpty()) {
            const cmd = this.redoStack.pop();
            cmd.execute();
            this.undoStack.push(cmd);
            this.updateButtons();
        }
    }

    canUndo() {
        return !this.undoStack.isEmpty();
    }

    canRedo() {
        return !this.redoStack.isEmpty();
    }

    updateButtons() {
        const undoButton = document.getElementById("undo");
        const redoButton = document.getElementById("redo");
        if (undoButton) undoButton.disabled = !this.canUndo();
        if (redoButton) redoButton.disabled = !this.canRedo();
    }
}

const undoManager = new UndoManager();

const stage = new Konva.Stage({
    container: "container",
    width: 400,
    height: 400,
});

// Une couche pour le dessin
const dessin = new Konva.Layer();
// Une couche pour la polyline en cours de construction
const temporaire = new Konva.Layer();
stage.add(dessin);
stage.add(temporaire);

const MAX_POINTS = 10;
let polyline // La polyline en cours de construction;
let lastAddedPolyline = null; // Pour la commande de couleur

const polylineMachine = createMachine(
    {
        id: "polyLine",
        initial: "idle",
        states: {
            idle: {
                on: {
                    MOUSECLICK: {
                        target: "onePoint",
                        actions: "createLine",
                    },
                },
            },
            onePoint: {
                on: {
                    MOUSECLICK: {
                        target: "manyPoints",
                        actions: "addPoint",
                    },
                    MOUSEMOVE: {
                        actions: "setLastPoint",
                    },
                    Escape: {
                        target: "idle",
                        actions: "abandon",
                    },
                },
            },
            manyPoints: {
                on: {
                    MOUSECLICK: [
                        {
                            actions: "addPoint",
                            cond: "pasPlein",
                        },
                        {
                            target: "idle",
                            actions: ["addPoint", "saveLine"],
                        },
                    ],

                    MOUSEMOVE: {
                        actions: "setLastPoint",
                    },

                    Escape: {
                        target: "idle",
                        actions: "abandon",
                    },

                    Enter: {
                        target: "idle",
                        actions: "saveLine",
                    },

                    Backspace: [
                        {
                            target: "manyPoints",
                            actions: "removeLastPoint",
                            cond: "plusDeDeuxPoints",
                            internal: true,
                        },
                        {
                            target: "onePoint",
                            actions: "removeLastPoint",
                        },
                    ],
                },
            },
        },
    },
    {
        actions: {
            createLine: (context, event) => {
                const pos = stage.getPointerPosition();
                polyline = new Konva.Line({
                    points: [pos.x, pos.y, pos.x, pos.y],
                    stroke: "red",
                    strokeWidth: 2,
                });
                temporaire.add(polyline);
            },
            setLastPoint: (context, event) => {
                const pos = stage.getPointerPosition();
                const currentPoints = polyline.points();
                const size = currentPoints.length;
                const newPoints = currentPoints.slice(0, size - 2);
                polyline.points(newPoints.concat([pos.x, pos.y]));
                temporaire.batchDraw();
            },
            saveLine: (context, event) => {
                polyline.remove();
                const currentPoints = polyline.points();
                const size = currentPoints.length;
                const newPoints = currentPoints.slice(0, size - 2);
                polyline.points(newPoints);
                polyline.stroke("black");
                // Utilisation UndoManager
                const cmd = new AddLineCommand(polyline, dessin);
                undoManager.executeCmd(cmd);
                lastAddedPolyline = polyline; // Pour la commande de couleur
            },
            addPoint: (context, event) => {
                const pos = stage.getPointerPosition();
                const currentPoints = polyline.points();
                const newPoints = [...currentPoints, pos.x, pos.y];
                polyline.points(newPoints);
                temporaire.batchDraw();
            },
            abandon: (context, event) => {
                polyline.remove();
            },
            removeLastPoint: (context, event) => {
                const currentPoints = polyline.points();
                const size = currentPoints.length;
                const provisoire = currentPoints.slice(size - 2, size);
                const oldPoints = currentPoints.slice(0, size - 4);
                polyline.points(oldPoints.concat(provisoire));
                temporaire.batchDraw();
            },
        },
        guards: {
            pasPlein: (context, event) => {
                return polyline.points().length < MAX_POINTS * 2;
            },
            plusDeDeuxPoints: (context, event) => {
                return polyline.points().length > 6;
            },
        },
    }
);

const polylineService = interpret(polylineMachine)
    .onTransition((state) => {
        console.log("Current state:", state.value);
    })
    .start();

stage.on("click", () => {
    polylineService.send("MOUSECLICK");
});

stage.on("mousemove", () => {
    polylineService.send("MOUSEMOVE");
});

window.addEventListener("keydown", (event) => {
    console.log("Key pressed:", event.key);
    polylineService.send(event.key);
});

// bouton Undo
const undoButton = document.getElementById("undo");
undoButton.addEventListener("click", () => {
    undoManager.undo();
});

// bouton Redo
const redoButton = document.getElementById("redo");
redoButton.addEventListener("click", () => {
    undoManager.redo();
});

// bouton pour changer la couleur de la dernière polyline ajoutée
const colorButton = document.getElementById("color");
if (colorButton) {
    colorButton.addEventListener("click", () => {
        if (lastAddedPolyline) {
            // Choix d'une couleur aléatoire pour l'exemple
            const colors = ["blue", "green", "orange", "purple", "pink"];
            const newColor = colors[Math.floor(Math.random() * colors.length)];
            const cmd = new ChangeColorCommand(lastAddedPolyline, newColor);
            undoManager.executeCmd(cmd);
        }
    });
}