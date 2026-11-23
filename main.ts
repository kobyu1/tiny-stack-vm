// Tiny stack VM for make.fun's tiny stack ISA v1, written from ISA.md:
// wrapping 32-bit ints, a 256-value stack, a 64-deep call stack, 256 words
// of memory, ten traps with their own exit codes. A trap ends the run with
// its code (HALT / EXIT throw 0 / the code), keeping the output before it.
// Opcodes: 0 HALT 1 PUSH8 2 PUSH32 3 POP 4 DUP 5 SWAP 6 OVER 7 ROT 23 NEG
// 27 NOT 48 JMP 49 JZ 50 JNZ 51 CALL 52 RET 64 LOAD 65 STORE 80 PRINT
// 81 PUTC 82 IN 83 EXIT, plus the two-operand group in the default case.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const I = process.env.MAKEFUN_INPUT_DIR ?? "/input", O = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
for (const id of readdirSync(I).sort()) {
  const P = readFileSync(join(I, id, "program.bin")), N = readFileSync(join(I, id, "input.bin")), n = P.length;
  const S = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256), out = new Uint8Array(65536);
  let sp = 0, cp = 0, pc = 0, st = 0, ip = 0, ol = 0, code = 0;
  // Stack needs are checked before an instruction runs: popping more than
  // the stack holds is trap 2, leaving more than 256 values is trap 3.
  const ck = (p, q) => { if (sp < p) throw 2; if (sp - p + q > 256) throw 3; };
  try {
    for (;;) {
      if (st == 1e6) throw 10;
      if (pc < 0 || pc >= n) throw 9;
      const op = P[pc], im = op == 1 ? 1 : op == 2 ? 4 : op >= 48 && op <= 51 ? 2 : 0;
      if (pc + im >= n) throw 9;
      st++;
      const nx = pc + 1 + im;
      let a, b, r;
      switch (op) {
        case 0: throw 0;
        case 1: ck(0, 1); S[sp++] = (P[nx - 1] << 24) >> 24; break;
        case 2: ck(0, 1); S[sp++] = P[nx - 4] | P[nx - 3] << 8 | P[nx - 2] << 16 | P[nx - 1] << 24; break;
        case 3: ck(1, 0); sp--; break;
        case 4: ck(1, 2); S[sp] = S[sp - 1]; sp++; break;
        case 5: ck(2, 2); a = S[sp - 1]; S[sp - 1] = S[sp - 2]; S[sp - 2] = a; break;
        case 6: ck(2, 3); S[sp] = S[sp - 2]; sp++; break;
        case 7: ck(3, 3); a = S[sp - 3]; S[sp - 3] = S[sp - 2]; S[sp - 2] = S[sp - 1]; S[sp - 1] = a; break;
        case 23: ck(1, 1); S[sp - 1] = -S[sp - 1] | 0; break;
        case 27: ck(1, 1); S[sp - 1] = ~S[sp - 1]; break;
        case 48: case 49: case 50: {
          if (op > 48) ck(1, 0);
          b = op == 48;
          if (op > 48) b = (op == 49) == (S[--sp] == 0);
          pc = b ? nx + (((P[nx - 2] | P[nx - 1] << 8) << 16) >> 16) : nx;
          continue;
        }
        case 51:
          if (cp == 64) throw 7;
          C[cp++] = nx; pc = P[nx - 2] | P[nx - 1] << 8; continue;
        case 52:
          if (cp == 0) throw 8;
          pc = C[--cp]; continue;
        case 64:
          ck(1, 1); a = S[sp - 1];
          if (a < 0 || a > 255) throw 6;
          S[sp - 1] = M[a]; break;
        case 65:
          ck(2, 0); a = S[sp - 1];
          if (a < 0 || a > 255) throw 6;
          M[a] = S[sp - 2]; sp -= 2; break;
        case 80: { // PRINT in decimal; past 65536 output bytes is trap 11
          ck(1, 0);
          const s = String(S[--sp]);
          if (ol + s.length > 65536) throw 11;
          for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
          break;
        }
        case 81:
          ck(1, 0);
          if (ol == 65536) throw 11;
          out[ol++] = S[--sp] & 255; break;
        case 82: ck(0, 1); S[sp++] = ip < N.length ? N[ip++] : -1; break;
        case 83: ck(1, 0); throw S[sp - 1] & 255;
        default: {
          if (op < 16 || op > 34 || op == 31) throw 5;
          ck(2, 1);
          b = S[sp - 1]; a = S[sp - 2];
          switch (op) {
            case 16: r = a + b | 0; break;
            case 17: r = a - b | 0; break;
            case 18: r = Math.imul(a, b); break;
            case 19: if (!b) throw 4; r = a / b | 0; break;
            case 20: if (!b) throw 4; r = b == -1 ? 0 : a % b | 0; break;
            case 21: if (!b) throw 4; r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
            case 22: if (!b) throw 4; r = (a >>> 0) % (b >>> 0) | 0; break;
            case 24: r = a & b; break;
            case 25: r = a | b; break;
            case 26: r = a ^ b; break;
            case 28: r = a << b; break;
            case 29: r = a >> b; break;
            case 30: r = a >>> b | 0; break;
            case 32: r = a === b ? 1 : 0; break;
            case 33: r = a < b ? 1 : 0; break;
            case 34: r = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
          }
          S[sp - 2] = r; sp--; break;
        }
      }
      pc = nx;
    }
  } catch (e) {
    if (typeof e != "number") throw e;
    code = e;
  }
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, "stdout.bin"), out.subarray(0, ol));
  writeFileSync(join(O, id, "exit.txt"), code + "\n");
}
