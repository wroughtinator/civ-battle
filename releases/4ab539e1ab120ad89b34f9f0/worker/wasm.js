// Small host adapter; all world generation, rules, AI and combat execute in Rust.
export function makeEngine(module) {
  const { exports: e } = new WebAssembly.Instance(module, {});
  const encode = new TextEncoder(), decode = new TextDecoder();
  return request => {
    const bytes = encode.encode(JSON.stringify(request));
    const ptr = e.alloc(bytes.length);
    new Uint8Array(e.memory.buffer, ptr, bytes.length).set(bytes);
    e.run(ptr, bytes.length);
    const result = JSON.parse(decode.decode(new Uint8Array(e.memory.buffer, e.output_ptr(), e.output_len())));
    if (!result.state) throw new Error('Simulation failed');
    return result;
  };
}
