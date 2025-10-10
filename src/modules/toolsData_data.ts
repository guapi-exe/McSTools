import {ref, shallowRef} from "vue";
import {Tag} from "./nbt/tag.ts";

export const data = ref()
export const json_data = shallowRef<Tag | string | undefined>()