export class Registry {
  constructor() {
    this.lenses = new Map();
    this.skins = new Map();
  }
  addLens(lens) {
    if (
      !lens.id ||
      !lens.version ||
      typeof lens.predict !== "function" ||
      this.lenses.has(lens.id)
    )
      throw Error("Invalid or duplicate lens");
    this.lenses.set(lens.id, lens);
  }
  addSkin(id, render) {
    if (this.skins.has(id) || typeof render !== "function")
      throw Error("Invalid or duplicate skin");
    this.skins.set(id, render);
  }
}
