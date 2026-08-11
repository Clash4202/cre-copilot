const VOYAGE_MODEL = 'voyage-3.5'
const EMBEDDING_DIMENSION = 1024

interface VoyageEmbeddingResponse {
  data: { embedding: number[]; index: number }[]
}

export async function embedTexts(
  texts: string[],
  inputType: 'document' | 'query'
): Promise<number[][]> {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSION,
    }),
  })

  if (!response.ok) {
    throw new Error(`Voyage embedding request failed: ${response.status} ${await response.text()}`)
  }

  const body = (await response.json()) as VoyageEmbeddingResponse
  return body.data.sort((a, b) => a.index - b.index).map((item) => item.embedding)
}
