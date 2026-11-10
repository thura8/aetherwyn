import { elementById, type ExperienceContext } from "../experienceContext";
import {
  isWizardClassId,
  type WizardClassId,
} from "../world/characters/wizardClasses";
import { ROOM_CODE_ALPHABET } from "./lobby";
import type { ScreenNavigator } from "./screenNavigator";

export function setUpJoinForm(
  context: ExperienceContext,
  screenNavigator: ScreenNavigator,
  seatPlayer: (
    name: string,
    isTestWizard: boolean,
    wizardClass?: WizardClassId,
  ) => number,
) {
  const { lifecycle, sound } = context;
  const codeInput = elementById<HTMLInputElement>("code-input");
  const nameInput = elementById<HTMLInputElement>("name-input");
  const errorText = elementById("join-error");

  lifecycle.listen(codeInput, "input", () => {
    const cleaned = codeInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);
    if (cleaned !== codeInput.value) codeInput.value = cleaned;
    codeInput.classList.remove("bad");
    errorText.textContent = "";
    if (cleaned.length === 4) sound.tick(true);
  });
  lifecycle.listen(nameInput, "input", () => {
    nameInput.classList.remove("bad");
    errorText.textContent = "";
  });

  function showError(input: HTMLInputElement, message: string) {
    input.classList.remove("bad");
    void input.offsetWidth;
    input.classList.add("bad");
    errorText.textContent = message;
    sound.error();
    input.focus();
  }

  lifecycle.listen(elementById("join-form"), "submit", (event) => {
    event.preventDefault();
    const room = context.room;
    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim().replace(/[\u0000-\u001f]/g, "");
    if (code.length !== 4)
      return showError(codeInput, "Room codes are 4 characters, like A94X.");
    if ([...code].some((character) => !ROOM_CODE_ALPHABET.includes(character)))
      return showError(
        codeInput,
        "Codes never use 0, O, 1 or I. Check the big screen.",
      );
    if (!name)
      return showError(
        nameInput,
        "Give your wizard a name (up to 20 characters).",
      );
    if (!room || room.code !== code)
      return showError(
        codeInput,
        `No open realm has the code ${code}. Check the code on the big screen.`,
      );
    if (room.players.every(Boolean))
      return showError(
        codeInput,
        "That realm is full. Four wizards are already in the circles.",
      );
    const chosenClass = new FormData(
      elementById<HTMLFormElement>("join-form"),
    ).get("wizard-class");
    seatPlayer(
      name,
      false,
      isWizardClassId(chosenClass) ? chosenClass : undefined,
    );
    sound.press();
    context.showToast(`${name} entered the realm.`);
    codeInput.value = "";
    nameInput.value = "";
    screenNavigator.goTo("lobby");
  });

  screenNavigator.onEnter.join = () => {
    if (context.world) context.world.state.portalBoost = 1;
    errorText.textContent = "";
    if (context.room && !codeInput.value)
      codeInput.placeholder = context.room.code;
  };
  screenNavigator.onLeave.join = () => {
    if (context.world) context.world.state.portalBoost = 0;
  };
}
