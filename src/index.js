import { render } from 'react-dom'
import React, { useState, useEffect } from 'react'
import { useSprings, animated, to as interpolate } from 'react-spring'
import { useDrag } from 'react-use-gesture'

import { ApolloClient, InMemoryCache, gql } from '@apollo/client'
import './styles.css'

const client = new ApolloClient({
  uri: 'https://api.thegraph.com/subgraphs/name/microchipgnu/collect-yield',
  cache: new InMemoryCache()
})

const fetchCards = async () => {
  return await client.query({
    query: gql`
      query GetUnborrowedNfts {
        nfts(where: { borrower: null }) {
          ERC721Address
          ERC20CollateralAmount
          borrower
          ERC721Id
          ERC721URI
          maxBorrowDuration
        }
      }
    `
  })
}

// These two are just helpers, they curate spring data, values that are later being interpolated into css
const to = (i) => ({ x: 0, y: i * -4, scale: 1, rot: -10 + Math.random() * 20, delay: i * 100 })
const from = (i) => ({ x: 0, rot: 0, scale: 1.5, y: -1000 })
// This is being used down there in the view, it interpolates rotation and scale into a css transform
const trans = (r, s) => `perspective(1500px) rotateX(30deg) rotateY(${r / 10}deg) rotateZ(${r}deg) scale(${s})`

function Deck() {
  const [gone] = useState(() => new Set()) // The set flags all the cards that are flicked out
  const [cards, setCards] = useState([])

  useEffect(() => {
    async function fetchIPFS() {
      const result = await fetchCards()
      const nfts = result.data.nfts
      let _cards = []
      for await (const nft of nfts) {
        await fetch(nft.ERC721URI)
          .then((res) => res.json())
          .then((data) => _cards.push({ ...nft, metadata: data }))
      }
      setCards(_cards)
    }
    fetchIPFS()
  }, [])

  const [props, set] = useSprings(cards.length, (i) => ({ ...to(i), from: from(i) })) // Create a bunch of springs using the helpers above
  // Create a gesture, we're interested in down-state, delta (current-pos - click-pos), direction and velocity
  const bind = useDrag(({ args: [index], down, movement: [mx], distance, direction: [xDir], velocity }) => {
    const trigger = velocity > 0.2 // If you flick hard enough it should trigger the card to fly out
    const dir = xDir < 0 ? -1 : 1 // Direction should either point left or right
    if (!down && trigger) gone.add(index) // If button/finger's up and trigger velocity is reached, we flag the card ready to fly out
    set((i) => {
      if (index !== i) return // We're only interested in changing spring-data for the current spring
      const isGone = gone.has(index)
      const x = isGone ? (200 + window.innerWidth) * dir : down ? mx : 0 // When a card is gone it flys out left or right, otherwise goes back to zero
      const rot = mx / 100 + (isGone ? dir * 10 * velocity : 0) // How much the card tilts, flicking it harder makes it rotate faster
      const scale = down ? 1.1 : 1 // Active cards lift up a bit
      return { x, rot, scale, delay: undefined, config: { friction: 50, tension: down ? 800 : isGone ? 200 : 500 } }
    })
    if (!down && gone.size === cards.length) setTimeout(() => gone.clear() || set((i) => to(i)), 600)
  })
  // Now we're just mapping the animated values to our view, that's it. Btw, this component only renders once. :-)
  return props.map(({ x, y, rot, scale }, i) => (
    <animated.div key={i} style={{ x, y }}>
      {/* This is the card itself, we're binding our gesture to it (and inject its index so we know which is which) */}
      <animated.div
        {...bind(i)}
        style={{
          transform: interpolate([rot, scale], trans),
          backgroundImage: `url(${cards[i].metadata.image_url || cards[i].metadata.image})`
        }}>
        <div>
          <p className="name">{cards[i].metadata.name}</p>
          <div className="price">
            <p>{cards[i].ERC20CollateralAmount / 1e18} DAI for {Math.round(cards[i].maxBorrowDuration / 86400)} days</p>
          </div>
        </div>
      </animated.div>
    </animated.div>
  ))
}

render(<Deck />, document.getElementById('root'))
