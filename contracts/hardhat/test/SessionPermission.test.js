const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { toCityId, toServiceId } = require("../lib/cityId");

const CITY = toCityId("Lisbon", "Portugal");
const SERVICE = toServiceId("miguel-airport-transfer");
const FEE = ethers.parseEther("0.1");
const ZERO_ADDR = ethers.ZeroAddress;

describe("SessionPermission", function () {
  async function deployFixture() {
    const [admin, treasury, user, user2, sessionKey, sessionKey2, other] = await ethers.getSigners();

    const Rating = await ethers.getContractFactory("ServiceRating");
    const rating = await Rating.deploy(admin.address, treasury.address);
    await rating.waitForDeployment();

    const Session = await ethers.getContractFactory("SessionPermission");
    const session = await Session.deploy(await rating.getAddress());
    await session.waitForDeployment();

    await rating.connect(admin).grantRelayer(await session.getAddress());

    const expiry = BigInt((await time.latest()) + 3600);

    return { rating, session, admin, treasury, user, user2, sessionKey, sessionKey2, other, expiry };
  }

  describe("grantSession", function () {
    it("succeeds with a valid future expiry, emits SessionGranted, and is reflected in isValidSession", async function () {
      const { session, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await expect(session.connect(user).grantSession(sessionKey.address, expiry))
        .to.emit(session, "SessionGranted")
        .withArgs(user.address, sessionKey.address, expiry);
      expect(await session.isValidSession(sessionKey.address, user.address)).to.equal(true);
    });

    it("reverts ZeroAddress for a zero session key", async function () {
      const { session, user, expiry } = await loadFixture(deployFixture);
      await expect(session.connect(user).grantSession(ZERO_ADDR, expiry)).to.be.revertedWithCustomError(
        session,
        "ZeroAddress"
      );
    });

    it("reverts InvalidExpiry for a non-future expiry", async function () {
      const { session, user, sessionKey } = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      await expect(session.connect(user).grantSession(sessionKey.address, now)).to.be.revertedWithCustomError(
        session,
        "InvalidExpiry"
      );
    });

    it("reverts SessionKeyInUse when the session key is already active for a different user", async function () {
      const { session, user, user2, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);
      await expect(session.connect(user2).grantSession(sessionKey.address, expiry)).to.be.revertedWithCustomError(
        session,
        "SessionKeyInUse"
      );
    });

    it("allows the same user to re-grant their own session key with an updated expiry", async function () {
      const { session, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);
      const newExpiry = expiry + 3600n;
      await expect(session.connect(user).grantSession(sessionKey.address, newExpiry))
        .to.emit(session, "SessionGranted")
        .withArgs(user.address, sessionKey.address, newExpiry);
    });
  });

  describe("revokeSession", function () {
    it("succeeds for the granting user, emits SessionRevoked, and rejects subsequent use", async function () {
      const { session, rating, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);

      await expect(session.connect(user).revokeSession(sessionKey.address))
        .to.emit(session, "SessionRevoked")
        .withArgs(user.address, sessionKey.address);

      await expect(
        session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(session, "SessionRevokedError");
      void rating;
    });

    it("reverts NotSessionOwner when called by anyone other than the granting user, including the session key itself", async function () {
      const { session, user, sessionKey, other, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);

      await expect(session.connect(other).revokeSession(sessionKey.address)).to.be.revertedWithCustomError(
        session,
        "NotSessionOwner"
      );
      await expect(session.connect(sessionKey).revokeSession(sessionKey.address)).to.be.revertedWithCustomError(
        session,
        "NotSessionOwner"
      );
    });

    it("reverts SessionNotFound for a never-granted session key", async function () {
      const { session, user, sessionKey } = await loadFixture(deployFixture);
      await expect(session.connect(user).revokeSession(sessionKey.address)).to.be.revertedWithCustomError(
        session,
        "SessionNotFound"
      );
    });

    it("takes effect immediately, with no grace window", async function () {
      const { session, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);
      await session.connect(user).revokeSession(sessionKey.address);
      await expect(
        session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(session, "SessionRevokedError");
    });

    it("prevents replay after revoke even after a prior successful submission", async function () {
      const { session, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);
      await session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "x", { value: FEE });

      await session.connect(user).revokeSession(sessionKey.address);
      await expect(
        session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "y", { value: FEE })
      ).to.be.revertedWithCustomError(session, "SessionRevokedError");
    });
  });

  describe("expiry", function () {
    it("succeeds one second before expiry and fails at/after expiry with SessionExpired", async function () {
      const { session, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);

      // setNextBlockTimestamp (not increaseTo) so our actual tx's block lands
      // on the exact target - increaseTo mines an extra empty block first,
      // which would push the following tx's timestamp one second later.
      await time.setNextBlockTimestamp(expiry - 1n);
      await expect(session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "x", { value: FEE })).to.not
        .be.reverted;

      await time.setNextBlockTimestamp(expiry);
      await expect(
        session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "y", { value: FEE })
      ).to.be.revertedWithCustomError(session, "SessionExpired");
    });

    it("distinguishes SessionExpired from SessionRevokedError for a session that was simply never revoked", async function () {
      const { session, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);
      await time.increaseTo(expiry + 1n);
      await expect(
        session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(session, "SessionExpired");
    });
  });

  describe("scoping and isolation", function () {
    it("never resolves a session key to a user it wasn't granted to", async function () {
      const { session, user, user2, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);
      expect(await session.isValidSession(sessionKey.address, user2.address)).to.equal(false);
      expect(await session.isValidSession(sessionKey.address, user.address)).to.equal(true);
    });

    it("reverts SessionNotFound when the session key calls directly without ever being granted", async function () {
      const { session, sessionKey } = await loadFixture(deployFixture);
      await expect(
        session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(session, "SessionNotFound");
    });

    it("blocks the session key from calling ServiceRating.submitRatingFor directly (it holds no role)", async function () {
      const { rating, session, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);
      await expect(
        rating.connect(sessionKey).submitRatingFor(user.address, CITY, SERVICE, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "AccessControlUnauthorizedAccount");
    });

    it("exposes no function that can reach anything on ServiceRating besides submitRatingFor", async function () {
      const { session } = await loadFixture(deployFixture);
      const fragments = session.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => f.name);
      expect(fragments.sort()).to.deep.equal(
        ["grantSession", "isValidSession", "revokeSession", "serviceRating", "submitRatingViaSession"].sort()
      );
    });
  });

  describe("fee and refund forwarding", function () {
    it("records the granting user as rater, not the session key or this contract", async function () {
      const { rating, session, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);

      await expect(session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "x", { value: FEE }))
        .to.emit(rating, "RatingSubmitted")
        .withArgs(user.address, CITY, SERVICE, 0n, 5, "x", anyValue);
    });

    it("forwards overpayment refund back to the session key caller, leaving no ETH stranded in SessionPermission", async function () {
      const { session, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);

      const overpay = FEE + ethers.parseEther("0.02");
      const balanceBefore = await ethers.provider.getBalance(sessionKey.address);
      const tx = await session
        .connect(sessionKey)
        .submitRatingViaSession(CITY, SERVICE, 5, "x", { value: overpay });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(sessionKey.address);

      expect(balanceBefore - balanceAfter).to.equal(FEE + gasCost);
      expect(await ethers.provider.getBalance(await session.getAddress())).to.equal(0n);
    });

    it("bubbles up InsufficientFee unmodified on underpayment", async function () {
      const { rating, session, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await session.connect(user).grantSession(sessionKey.address, expiry);

      const underpay = FEE - 1n;
      await expect(
        session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "x", { value: underpay })
      ).to.be.revertedWithCustomError(rating, "InsufficientFee");
    });
  });

  describe("daily limit sharing", function () {
    it("charges the session-relayed rating against the same per-user daily bucket as a manual rating", async function () {
      const { rating, session, admin, user, sessionKey, expiry } = await loadFixture(deployFixture);
      await rating.connect(admin).setDailyRatingLimit(1);
      await session.connect(user).grantSession(sessionKey.address, expiry);

      await rating.connect(user).submitRating(CITY, SERVICE, 5, "manual", { value: FEE });

      await expect(
        session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "session", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "DailyLimitExceeded");
    });
  });

  describe("reentrancy safety", function () {
    it("a reentrant call attempt during the relayed call fails on session-key identity, and no funds are stranded", async function () {
      const [admin, treasury, user, sessionKey] = await ethers.getSigners();

      const Malicious = await ethers.getContractFactory("MaliciousServiceRating");
      const malicious = await Malicious.deploy();
      await malicious.waitForDeployment();

      const Session = await ethers.getContractFactory("SessionPermission");
      const session = await Session.deploy(await malicious.getAddress());
      await session.waitForDeployment();
      await malicious.setAttacker(await session.getAddress());

      const expiry = BigInt((await time.latest()) + 3600);
      await session.connect(user).grantSession(sessionKey.address, expiry);

      await session.connect(sessionKey).submitRatingViaSession(CITY, SERVICE, 5, "x", { value: FEE });

      expect(await malicious.reentered()).to.equal(true);
      expect(await malicious.reentryReverted()).to.equal(true); // the malicious contract itself has no valid grant
      expect(await ethers.provider.getBalance(await session.getAddress())).to.equal(0n);
      void admin;
      void treasury;
    });
  });
});
