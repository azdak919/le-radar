// LE-RADAR — point d'entrée client.
// La logique vit dans radar-*.js (scripts classiques, defer, même ordre partout).
init().catch((e) => console.error('init failed', e));
