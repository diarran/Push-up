// Conversion d'une animation FBX (export Mixamo) en glTF binaire (.glb),
// a lancer une fois par animation ajoutee :
//
//   node scripts/fbx-to-glb.mjs entree.fbx sortie.glb
//
// Pourquoi convertir plutot que charger le FBX directement : un export
// Mixamo embarque les textures du personnage, qui representent l'essentiel
// du poids du fichier (33 Mo pour les pompes) alors que l'application les
// remplace de toute facon par son rendu hologramme. En les supprimant et
// en passant au format glTF, il ne reste que la geometrie, le squelette et
// l'animation : ~4,7 Mo, charges par le meme GLTFLoader que le corps
// anatomique, sans embarquer FBXLoader dans le bundle.
//
// La conversion tourne dans Node, ou Three.js s'attend malgre tout a
// trouver quelques objets du navigateur : ils sont simules ci-dessous,
// juste assez pour que le chargement et l'export aboutissent.

globalThis.window = globalThis;
globalThis.self = globalThis;
const fakeElement = () => ({
  style: {},
  setAttribute() {},
  addEventListener() {},
  getContext: () => ({ drawImage() {} })
});
globalThis.document = { createElement: fakeElement, createElementNS: fakeElement };
globalThis.Image = class {
  set src(value) {}
};
// GLTFExporter assemble le binaire via FileReader, absent de Node.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      if (this.onloadend) this.onloadend();
    });
  }
};

const THREE = await import("three");
const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
const { readFileSync, writeFileSync } = await import("node:fs");

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage : node scripts/fbx-to-glb.mjs entree.fbx sortie.glb");
  process.exit(1);
}

const source = readFileSync(input);
const object = new FBXLoader().parse(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), "");

// Materiaux et textures d'origine remplaces par un materiau neutre :
// l'application applique son propre rendu au chargement.
object.traverse((child) => {
  if (!child.isMesh) return;
  for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
    if (!material) continue;
    for (const value of Object.values(material)) {
      if (value && value.isTexture) value.dispose();
    }
  }
  child.material = new THREE.MeshStandardMaterial({ color: 0x888888 });
});

// Un export Mixamo contient souvent un clip technique vide ("Take 001") en
// plus du mouvement : on ne garde que ce qui anime reellement quelque chose.
const clips = object.animations.filter((clip) => clip.tracks.length > 0 && clip.duration > 0);
if (clips.length === 0) {
  console.error("Aucune animation exploitable dans ce fichier.");
  process.exit(1);
}
console.log("clips conserves :", clips.map((c) => `${c.name} (${c.duration.toFixed(2)} s)`).join(", "));

const glb = await new Promise((resolve, reject) =>
  new GLTFExporter().parse(object, resolve, reject, { binary: true, animations: clips, onlyVisible: false })
);

const bytes = Buffer.from(glb);
writeFileSync(output, bytes);
console.log(
  `${output} ecrit : ${(bytes.length / 1048576).toFixed(2)} Mo ` +
    `(source : ${(source.length / 1048576).toFixed(2)} Mo)`
);
