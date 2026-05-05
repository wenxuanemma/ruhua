# Restore the 5 paintings again and rerun
node -e "
const fs = require('fs'), path = require('path');
const f = JSON.parse(fs.readFileSync('museum-paintings/filtered-metadata.json', 'utf8'));
const TITLES = ['唐周昉调琴啜茗图', 'Anonymous-The King of Dongdan Goes Forth', 'Zhigongtu', '虢国夫人游春图', 'Li Kung-lin 001'];
const toRescue = f.rejected.filter(p => TITLES.some(t => p.title.includes(t)));
f.rejected = f.rejected.filter(p => !TITLES.some(t => p.title.includes(t)));
toRescue.forEach(p => {
  const src = 'rejected-paintings/' + path.basename(p.localFile);
  if (fs.existsSync(src)) { fs.renameSync(src, p.localFile); console.log('Restored:', p.title); }
  delete p.localFile;
});
fs.writeFileSync('museum-paintings/filtered-metadata.json', JSON.stringify(f, null, 2));
"

node scripts/filter-faces.mjs
