import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {terminalExecutable,terminalLaunchArgs} from '../lib/studio-terminal.mjs';

test('PowerShell launch uses session-scoped RemoteSigned, not persistent policy changes',()=>{
 const args=terminalLaunchArgs();
 assert.equal(args[args.indexOf('-ExecutionPolicy')+1],'RemoteSigned');
 assert.ok(args.includes('-NoProfile'));
 assert.equal(args.includes('Bypass'),false);
 assert.equal(args.some(x=>x.includes('Set-ExecutionPolicy')),false);
});
test('interactive ConPTY can import PSReadLine under the current user policy',{timeout:16000,skip:process.platform!=='win32'},async()=>{
 const require=createRequire(import.meta.url);
 const pty=require('node-pty');
 const term=pty.spawn(terminalExecutable(),terminalLaunchArgs(),{
  cwd:process.cwd(),cols:110,rows:35,name:'xterm-256color',
  env:{...process.env,TERM:'xterm-256color'},
 });
 let transcript='';
 const output=term.onData(data=>{transcript+=data;});
 const start=Date.now();
 try{
  while(Date.now()-start<9000&&!/PS [A-Z]:\\/.test(transcript))await new Promise(resolve=>setTimeout(resolve,80));
  assert.match(transcript,/PS [A-Z]:\\/,'PowerShell must reach interactive prompt');
  term.write("if (Get-Module PSReadLine) { Write-Output ('STUDIO_' + 'PSREADLINE_' + 'OK') } else { Write-Output ('STUDIO_' + 'PSREADLINE_' + 'FAIL') }\r");
  while(Date.now()-start<13000&&!transcript.includes('STUDIO_PSREADLINE_OK')&&!transcript.includes('STUDIO_PSREADLINE_FAIL'))await new Promise(resolve=>setTimeout(resolve,90));
  assert.match(transcript,/STUDIO_PSREADLINE_OK/,'PSReadLine should be loaded without security error');
  assert.doesNotMatch(transcript,/running scripts is disabled|Cannot load PSReadline module/i);
 }finally{output.dispose();term.kill();}
});