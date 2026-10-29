const notesInput = document.querySelector("#notes");
const characterCount = document.querySelector("#character-count");
const statusMessage = document.querySelector("#status");
const resultCard = document.querySelector("#result-card");
const resultTitle = document.querySelector("#result-title");
const resultContent = document.querySelector("#result");
const actionButtons = document.querySelectorAll("[data-mode]");
const fileInput = document.querySelector("#notes-file");
const uploadButton = document.querySelector(".upload-button");

notesInput.addEventListener("input", () => {
  characterCount.textContent = `${notesInput.value.length.toLocaleString()} / 20,000`;
});

for (const button of actionButtons) {
  button.addEventListener("click", () => generateStudyMaterial(button.dataset.mode));
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) {
    return;
  }

  statusMessage.removeAttribute("data-error");
  setLoading(true);
  statusMessage.textContent = `Reading ${file.name}...`;

  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/notes/extract", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "The file could not be read.");
    }

    notesInput.value = data.text;
    notesInput.dispatchEvent(new Event("input"));
    resultCard.hidden = true;
    notesInput.focus();
    statusMessage.textContent = `Loaded ${data.filename}. Review or edit the extracted notes before continuing.`;
  } catch (error) {
    showError(error.message || "Could not reach the Study Buddy server.");
  } finally {
    fileInput.value = "";
    setLoading(false);
  }
});

async function generateStudyMaterial(mode) {
  const notes = notesInput.value.trim();
  statusMessage.removeAttribute("data-error");
  resultCard.hidden = true;

  if (notes.length < 30) {
    showError("Add at least 30 characters of notes first.");
    notesInput.focus();
    return;
  }

  setLoading(true);
  statusMessage.textContent = mode === "summary"
    ? "Making your summary..."
    : "Creating your quiz...";

  try {
    const response = await fetch("/api/study", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes, mode }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "The request could not be completed.");
    }

    resultTitle.textContent = mode === "summary" ? "Your summary" : "Your practice quiz";
    if (mode === "quiz") {
      renderQuiz(data.questions);
    } else {
      resultContent.textContent = data.result;
    }
    resultCard.hidden = false;
    statusMessage.textContent = "Done. Keep learning!";
  } catch (error) {
    showError(error.message || "Could not reach the Study Buddy server.");
  } finally {
    setLoading(false);
  }
}

function renderQuiz(questions) {
  resultContent.replaceChildren();

  const form = document.createElement("form");
  form.className = "quiz-form";

  questions.forEach((question, questionIndex) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "quiz-question";

    const legend = document.createElement("legend");
    legend.textContent = `${questionIndex + 1}. ${question.question}`;
    fieldset.append(legend);

    const feedback = document.createElement("p");
    feedback.className = "answer-feedback";
    feedback.hidden = true;

    question.choices.forEach((choice, choiceIndex) => {
      const label = document.createElement("label");
      label.className = "quiz-choice";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `question-${questionIndex}`;
      input.value = String(choiceIndex);

      const choiceText = document.createElement("span");
      choiceText.textContent = choice;
      label.append(input, choiceText);
      fieldset.append(label);
    });

    fieldset.append(feedback);
    form.append(fieldset);
  });

  const submitButton = document.createElement("button");
  submitButton.className = "button button-primary quiz-submit";
  submitButton.type = "submit";
  submitButton.textContent = "Check my answers";
  form.append(submitButton);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const answers = new FormData(form);
    const unanswered = questions.findIndex(
      (_, questionIndex) => !answers.has(`question-${questionIndex}`),
    );

    if (unanswered !== -1) {
      showError(`Please answer question ${unanswered + 1} before checking.`);
      form.querySelector(`[name="question-${unanswered}"]`).focus();
      return;
    }

    let score = 0;
    questions.forEach((question, questionIndex) => {
      const selectedAnswer = Number(answers.get(`question-${questionIndex}`));
      const isCorrect = selectedAnswer === question.correct_answer;
      const fieldset = form.querySelectorAll(".quiz-question")[questionIndex];
      const feedback = fieldset.querySelector(".answer-feedback");

      if (isCorrect) {
        score += 1;
      }

      fieldset.querySelectorAll("input").forEach((input) => {
        input.disabled = true;
      });

      feedback.textContent = `${isCorrect ? "Correct!" : `Not quite. The correct answer is: ${question.choices[question.correct_answer]}.`} ${question.explanation}`;
      feedback.classList.toggle("is-correct", isCorrect);
      feedback.classList.toggle("is-incorrect", !isCorrect);
      feedback.hidden = false;
    });

    const scoreMessage = document.createElement("p");
    scoreMessage.className = "quiz-score";
    scoreMessage.setAttribute("role", "status");
    scoreMessage.textContent = `You scored ${score} out of ${questions.length}.`;
    form.prepend(scoreMessage);
    submitButton.hidden = true;
    statusMessage.removeAttribute("data-error");
    statusMessage.textContent = "Quiz checked. Review the explanations below.";
  });

  resultContent.append(form);
}

function setLoading(isLoading) {
  for (const button of actionButtons) {
    button.disabled = isLoading;
  }
  fileInput.disabled = isLoading;
  uploadButton.classList.toggle("is-disabled", isLoading);
}

function showError(message) {
  statusMessage.textContent = message;
  statusMessage.dataset.error = "true";
}
