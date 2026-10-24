// Cross-runtime regression helper: native SNBT in, worker-owned document SNBT
// out. Everything stays in pipes; no blueprint contents are written to disk.
import {buildSync} from 'esbuild';
const build = buildSync({entryPoints: ['src/modules/nbt/source_document.ts'], bundle: true, write: false, format: 'esm', platform: 'node'});
const {SourceDocument} = await import('data:text/javascript;base64,' + Buffer.from(build.outputFiles[0].text).toString('base64'));
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
try {
  const doc = new SourceDocument();
  doc.load(Buffer.concat(chunks).toString('utf8'));
  process.stdout.write(doc.save());
} catch (error) {
  // A location is enough for diagnosis; never dump the source document.
  process.stderr.write(error instanceof Error ? error.message : 'Source round trip failed');
  process.exitCode = 1;
}
