<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTimelineStore } from '../stores/timeline';
import type { Post } from '../api/types';
import ErrorPanel from './ErrorPanel.vue';

const props = defineProps<{ post: Post }>();
const emit = defineEmits<{ close: [] }>();

const store = useTimelineStore();
const text = ref(props.post.text);
const saving = ref(false);

const length = computed(() => [...text.value.normalize('NFC')].length);
const canSave = computed(() => length.value >= 1 && length.value <= 500 && !saving.value);

async function save(): Promise<void> {
  if (!canSave.value) return;
  saving.value = true;
  const ok = await store.applyEdit(props.post.id, text.value);
  saving.value = false;
  // Stay open on failure so the typed text survives and the error sits next to what caused it.
  if (ok) emit('close');
}
</script>

<template>
  <div class="edit-box">
    <textarea v-model="text" rows="3" aria-label="Edit your post"></textarea>
    <div class="actions">
      <span :class="{ over: length > 500 }">{{ length }} / 500</span>
      <button type="button" :disabled="!canSave" @click="save">
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
      <button type="button" @click="emit('close')">Cancel</button>
    </div>

    <!-- A closed window renders with no retry button: the response says retrying never succeeds,
         and offering the button anyway would be a lie the user pays for twice. A stale revision
         renders its own message asking for a reload rather than silently overwriting. -->
    <ErrorPanel v-if="store.editError" :error="store.editError" />
  </div>
</template>

<style scoped>
.edit-box {
  margin-top: 0.5rem;
}
textarea {
  width: 100%;
  font: inherit;
  padding: 0.5rem;
  box-sizing: border-box;
}
.actions {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  justify-content: flex-end;
  margin-top: 0.35rem;
  font-size: 0.85rem;
}
.over {
  color: #b3261e;
  font-weight: 600;
}
</style>
