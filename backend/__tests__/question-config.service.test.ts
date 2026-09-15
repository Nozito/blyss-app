/**
 * Tests — question-config.service.ts (CRUD questions/choix, moteur V2).
 * Réf : docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§9, §17, §21.1).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute, mockQuery } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockQuery = vi.fn();
  return { mockExecute, mockQuery };
});

vi.mock("../lib/db", () => ({
  getDb: () => ({ execute: mockExecute, query: mockQuery }),
}));

import {
  QuestionConfigError,
  createQuestion,
  updateQuestion,
  deleteOrDeactivateQuestion,
  createQuestionChoice,
  deleteQuestionChoice,
  suggestSensitive,
} from "../services/question-config.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createQuestion", () => {
  it("crée une question après vérification d'ownership de la prestation", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ id: 10 }], []]) // assertOwnsPrestation
      .mockResolvedValueOnce([[{ id: 1, label: "As-tu une allergie ?", type: "short_text", required: false, is_sensitive: true }], []]);

    const result = await createQuestion(10, 2, { label: "As-tu une allergie ?", type: "short_text", isSensitive: true });

    expect(result.id).toBe(1);
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[0]).toContain("INSERT INTO questions");
  });

  it("rejette (404) si la prestation n'appartient pas à ce pro", async () => {
    mockQuery.mockResolvedValueOnce([[], []]); // aucune ligne trouvée pour ce pro_id

    await expect(createQuestion(10, 999, { label: "Test", type: "short_text" })).rejects.toMatchObject({
      status: 404,
      code: "PRESTATION_NOT_FOUND",
    });
  });
});

describe("updateQuestion", () => {
  it("rejette (404) si la question n'appartient pas à ce pro", async () => {
    mockQuery.mockResolvedValueOnce([[], []]);
    await expect(updateQuestion(1, 999, { label: "x" })).rejects.toBeInstanceOf(QuestionConfigError);
  });

  it("met à jour uniquement les champs fournis", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ prestation_id: 10 }], []]) // ownership
      .mockResolvedValueOnce([[{ id: 1, label: "Nouveau libellé", type: "short_text" }], []]); // SELECT final

    await updateQuestion(1, 2, { label: "Nouveau libellé" });

    const updateCall = mockQuery.mock.calls[1];
    // Deux appels seulement : ownership + SELECT si aucune colonne à modifier
    // n'a été passée à execute — ici label est fourni, donc un execute a lieu.
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute.mock.calls[0][0]).toContain("UPDATE questions SET label = ?");
  });
});

describe("deleteOrDeactivateQuestion", () => {
  it("supprime physiquement une question jamais répondue", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ prestation_id: 10 }], []]) // ownership
      .mockResolvedValueOnce([[], []]); // aucun usage dans reservation_item_answers

    const result = await deleteOrDeactivateQuestion(1, 2);

    expect(result).toEqual({ deactivated: false });
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM questions"), [1]);
  });

  it("désactive (ne supprime pas) une question déjà répondue", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ prestation_id: 10 }], []]) // ownership
      .mockResolvedValueOnce([[{ 1: 1 }], []]); // usage trouvé

    const result = await deleteOrDeactivateQuestion(1, 2);

    expect(result).toEqual({ deactivated: true });
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("UPDATE questions SET active = FALSE"), [1]);
  });
});

describe("createQuestionChoice", () => {
  it("rejette (422) l'ajout d'un choix sur une question de type non compatible", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 1, type: "short_text" }], []]);

    await expect(createQuestionChoice(1, 2, { label: "Option A" })).rejects.toMatchObject({
      status: 422,
      code: "QUESTION_TYPE_NO_CHOICES",
    });
  });

  it("crée un choix sur une question single_choice", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ id: 1, type: "single_choice" }], []])
      .mockResolvedValueOnce([[{ id: 100, label: "Option A" }], []]);

    const result = await createQuestionChoice(1, 2, { label: "Option A" });
    expect(result.label).toBe("Option A");
  });
});

describe("deleteQuestionChoice", () => {
  it("rejette (409) la suppression d'un choix déjà utilisé dans une réponse", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ question_id: 1, label: "Naturel" }], []]) // ownership + label
      .mockResolvedValueOnce([[{ exists: 1 }], []]); // usage trouvé

    await expect(deleteQuestionChoice(100, 2)).rejects.toMatchObject({
      status: 409,
      code: "CHOICE_ALREADY_USED",
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("supprime un choix jamais utilisé", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ question_id: 1, label: "Naturel" }], []])
      .mockResolvedValueOnce([[], []]); // aucun usage

    await deleteQuestionChoice(100, 2);
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM question_choices"), [100]);
  });
});

describe("suggestSensitive", () => {
  it("suggère is_sensitive quand le libellé contient un mot-clé évocateur", () => {
    const result = suggestSensitive("As-tu une allergie connue ?");
    expect(result.suggested).toBe(true);
    expect(result.matchedKeywords).toContain("allergie");
  });

  it("ne suggère rien pour un libellé neutre", () => {
    const result = suggestSensitive("Quelle forme préfères-tu ?");
    expect(result.suggested).toBe(false);
    expect(result.matchedKeywords).toEqual([]);
  });
});
