export function countTrailingCharacter(value, character) {
  let end = value.length;
  while (end > 0 && value[end - 1] === character) end -= 1;
  return value.length - end;
}

export function trimTrailingCharacter(value, character) {
  return value.slice(0, value.length - countTrailingCharacter(value, character));
}
