// Patch node-pty 1.1.0's Windows ConPTY cleanup helper. On Windows the
// pseudo-console may be gone before the forked helper calls AttachConsole.
// Native code then throws at module top-level (an uncaught Electron dialog).
// Narrowly catch that known race and use node-pty's existing shell-PID fallback.
// Do NOT suppress other native errors or edit any project/user content.
// See microsoft/node-pty#952. Remove this patch when upgrading to a verified fix.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const version=require('node-pty/package.json').version;
if(version!=='1.1.0')throw Error('Unverified node-pty version '+version+'; review the ConPTY workaround before changing versions.');
const file=require.resolve('node-pty/lib/conpty_console_list_agent.js');
const source=await readFile(file,'utf8');
const marker='// Video Studio node-pty#952 guard';
const needle='var consoleProcessList = getConsoleProcessList(shellPid);';
const patched=[
marker,
'var consoleProcessList;',
'try {',
'    consoleProcessList = getConsoleProcessList(shellPid);',
'} catch (error) {',
"    // The target console has already exited; use node-pty's existing fallback.",
"    if (!error || error.message !== 'AttachConsole failed') throw error;",
'    consoleProcessList = [shellPid];',
'}',
].join('\n');
if(source.includes(marker)){
 if(!source.includes(patched))throw Error('Modified ConPTY workaround does not match expected content');
 console.log('node-pty ConPTY workaround already applied');
}else{
 if(!source.includes(needle))throw Error('node-pty helper changed upstream; inspect manually');
 await writeFile(file,source.replace(needle,patched),'utf8');
 console.log('Applied node-pty ConPTY cleanup guard (AttachConsole failed only)');
}
