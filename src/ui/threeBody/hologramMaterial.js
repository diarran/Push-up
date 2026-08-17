import * as THREE from "three";

// Materiau "hologramme" partage par tout rendu 3D de l'application (corps
// de ciblage, rig anime des tutoriels, future carte de fatigue) : un
// shader Fresnel (coeur sombre translucide, bords lumineux) plutot qu'un
// materiau standard. Combine au bloom (post-traitement, cote de chaque
// ecran 3D), c'est ce qui donne l'identite visuelle "neon" commune a
// toute l'application. Une seule definition ici evite que chaque ecran
// 3D ne reimplemente sa propre version legerement differente.

export const DEFAULT_BASE_COLOR = new THREE.Color(0x030a08);
export const DEFAULT_RIM_COLOR = new THREE.Color(0x00e676);
export const DEFAULT_GLOW_INTENSITY = 0.4;

const VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 baseColor;
  uniform vec3 glowColor;
  uniform float glowIntensity;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.6);
    vec3 color = baseColor + glowColor * fresnel * glowIntensity;
    float alpha = clamp(0.1 + fresnel * 0.8, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

// Variante pour les maillages deformes par un squelette (personnage anime
// du tutoriel). Un ShaderMaterial ecrit a la main devrait pouvoir appliquer
// lui-meme la deformation via les blocs `skinning` de Three.js, mais le
// personnage restait fige dans sa pose de repos. On part donc d'un
// materiau integre a Three.js, dont le shader de sommets gere le squelette
// de maniere certaine, et on n'injecte que l'aspect hologramme dans le
// shader de fragments.
//
// L'eclairage calcule par MeshPhongMaterial est entierement remplace : ce
// materiau ne sert que de support a un vertex shader correct. La scene n'a
// donc besoin d'aucune lumiere, comme pour les maillages statiques.
export function createSkinnedHologramMaterial({
  baseColor = DEFAULT_BASE_COLOR,
  rimColor = DEFAULT_RIM_COLOR,
  glowIntensity = DEFAULT_GLOW_INTENSITY
} = {}) {
  const material = new THREE.MeshPhongMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const uniforms = {
    holoBase: { value: baseColor.clone() },
    holoGlow: { value: rimColor.clone() },
    holoIntensity: { value: glowIntensity }
  };
  material.userData.uniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 holoBase;
        uniform vec3 holoGlow;
        uniform float holoIntensity;`
      )
      // Dernier bloc du shader de fragments : `normal` (normale en espace
      // camera) y est deja calcule. Une normale perpendiculaire a l'ecran
      // donne le coeur sombre, une normale rasante donne le bord lumineux.
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float holoRim = pow(1.0 - abs(normal.z), 2.6);
        gl_FragColor = vec4(
          holoBase + holoGlow * holoRim * holoIntensity,
          clamp(0.1 + holoRim * 0.8, 0.0, 1.0)
        );`
      );
  };

  return material;
}

export function createHologramMaterial({
  baseColor = DEFAULT_BASE_COLOR,
  rimColor = DEFAULT_RIM_COLOR,
  glowIntensity = DEFAULT_GLOW_INTENSITY
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: baseColor.clone() },
      glowColor: { value: rimColor.clone() },
      glowIntensity: { value: glowIntensity }
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}
