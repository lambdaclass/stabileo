<script lang="ts">
  import { tm } from './i18n';
</script>

<ul class="mh-legend" aria-label={tm('mohr.legend')}>
  <li><span class="mh-key mh-key-ten" aria-hidden="true"></span>{tm('mohr.tension')}</li>
  <li><span class="mh-key mh-key-comp" aria-hidden="true"></span>{tm('mohr.compression')}</li>
  <li><span class="mh-key mh-key-shear" aria-hidden="true"></span>{tm('mohr.shear')}</li>
  <li><span class="mh-key mh-key-current" aria-hidden="true"></span>{tm('mohr.current')}</li>
  <li><span class="mh-key mh-key-principal" aria-hidden="true"></span>{tm('mohr.directions')}</li>
</ul>
