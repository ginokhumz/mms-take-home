<script setup lang="ts">
import { ref } from 'vue';
// The fault list is imported from the fixture server rather than retyped here, so the panel can
// never offer a code the server does not implement. Both sides are dev-only.
import { FAULTS } from '../../mock/faults';

const codes = Object.keys(FAULTS).sort();
const targets = ['', 'timeline', 'publish', 'patch', 'revisions'] as const;

const current = new URLSearchParams(window.location.search);
const fault = ref(current.get('fault') ?? '');
const faultOn = ref(current.get('fault_on') ?? '');
const faultAfter = ref(current.get('fault_after') ?? '');
const latency = ref(current.get('latency') ?? '');
const empty = ref(current.get('empty') === '1');
const degraded = ref(current.get('degraded') === '1');

/**
 * Applying writes the query string and reloads, so the URL stays the single source of truth for
 * the fixture state and any state is shareable as a link. The same states are reachable by typing
 * the parameters by hand, which is the point: no code edit is needed to see a failure.
 */
function apply(): void {
  const next = new URLSearchParams();
  if (fault.value !== '') next.set('fault', fault.value);
  if (faultOn.value !== '') next.set('fault_on', faultOn.value);
  if (faultAfter.value !== '') next.set('fault_after', faultAfter.value);
  if (latency.value !== '') next.set('latency', latency.value);
  if (empty.value) next.set('empty', '1');
  if (degraded.value) next.set('degraded', '1');
  window.location.search = next.toString();
}

function clear(): void {
  window.location.search = '';
}
</script>

<template>
  <aside class="faults">
    <!-- The wording matters: these parameters are a fixture affordance, not part of the API. -->
    <strong>Mock controls (not part of the API contract)</strong>
    <div class="row">
      <label>
        fault
        <select v-model="fault">
          <option value="">none</option>
          <option v-for="code in codes" :key="code" :value="code">{{ code }}</option>
        </select>
      </label>
      <label>
        fault_on
        <select v-model="faultOn">
          <option v-for="t in targets" :key="t" :value="t">{{ t === '' ? 'all' : t }}</option>
        </select>
      </label>
      <label>
        fault_after
        <input v-model="faultAfter" type="number" min="0" placeholder="0" size="3" />
      </label>
      <label>
        latency ms
        <input v-model="latency" type="number" min="0" placeholder="0" size="5" />
      </label>
      <label><input v-model="empty" type="checkbox" /> empty</label>
      <label><input v-model="degraded" type="checkbox" /> degraded</label>
      <button type="button" @click="apply">Apply</button>
      <button type="button" @click="clear">Clear</button>
    </div>
  </aside>
</template>

<style scoped>
.faults {
  border: 1px dashed #888;
  padding: 0.6rem 0.8rem;
  margin-bottom: 1rem;
  font-size: 0.8rem;
  background: #fafafa;
}
.row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}
label {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}
</style>
